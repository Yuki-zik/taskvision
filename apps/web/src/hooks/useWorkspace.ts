import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourceHighlightSettings } from '../services/sourceHighlight';
import type { Snapshot } from '../domain';
import { api, errorMessage, type Mutate } from '../services/api';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type PreferencePatch,
} from '../services/personalization';

export function useWorkspace(projectId = '') {
  const [loaded, setLoaded] = useState<{ projectId: string; snapshot: Snapshot } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [highlightSettings, setHighlightSettings] = useState<SourceHighlightSettings | undefined>(
    undefined,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [pendingOperations, setPendingOperations] = useState(0);
  const token = useRef('');
  const activeProject = useRef(projectId);
  activeProject.current = projectId;
  const mounted = useRef(true);
  const failures = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<PreferencePatch>({});
  const personal = useRef(preferences);
  const saving = useRef<Promise<void> | null>(null);
  const savingBytes = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      let next: Snapshot;
      if (!token.current) {
        const [boot, saved] = await Promise.all([
          api.bootstrap(current.signal, projectId),
          api.preferences(projectId, current.signal),
        ]);
        if (current.signal.aborted || activeProject.current !== projectId) return;
        token.current = boot.token;
        next = boot.snapshot;
        personal.current = normalizePreferences(saved.preferences);
        setPreferences(personal.current);
        setPreferencesReady(true);
      } else next = await api.snapshot(current.signal, projectId);
      if (current.signal.aborted || activeProject.current !== projectId) return;
      setLoaded((previous) =>
        previous?.projectId === projectId &&
        previous.snapshot.revision === next.revision &&
        previous.snapshot.project.head === next.project.head &&
        previous.snapshot.project.workspaceId === next.project.workspaceId &&
        previous.snapshot.project.branch === next.project.branch &&
        JSON.stringify(previous.snapshot.claims) === JSON.stringify(next.claims)
          ? previous
          : { projectId, snapshot: next },
      );
      setError('');
      failures.current = 0;
    } catch (failure) {
      if (!current.signal.aborted && activeProject.current === projectId) {
        failures.current++;
        setError(errorMessage(failure));
      }
    } finally {
      if (!current.signal.aborted && activeProject.current === projectId) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    mounted.current = true;
    token.current = '';
    failures.current = 0;
    pending.current = {};
    personal.current = DEFAULT_PREFERENCES;
    setPreferences(DEFAULT_PREFERENCES);
    setPreferencesReady(false);
    setHighlightSettings(undefined);
    setPreferenceError('');
    setLoaded(null);
    setError('');
    setLoading(true);
    let running = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (running) return;
      running = true;
      if (document.visibilityState !== 'hidden') await refresh();
      running = false;
      if (alive)
        timer = setTimeout(
          () => {
            void poll();
          },
          Math.min(30000, 2500 * 2 ** Math.min(failures.current, 4)),
        );
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        void poll();
      }
    };
    void poll();
    const highlightController = new AbortController();
    void api
      .highlightSettings(projectId, highlightController.signal)
      .then((result) => {
        if (!highlightController.signal.aborted) setHighlightSettings(result.settings ?? undefined);
      })
      .catch(() => {
        /* Standalone/older servers use manifest defaults. */
      });
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      mounted.current = false;
      clearTimeout(timer);
      clearTimeout(saveTimer.current);
      controller.current?.abort();
      highlightController.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  const flushPreferences = useCallback(async (): Promise<void> => {
    clearTimeout(saveTimer.current);
    if (saving.current) {
      await saving.current;
      // A second caller may have queued additional fields during the write.
      if (Object.keys(pending.current).length) await flushPreferences();
      return;
    }
    if (!Object.keys(pending.current).length) return;
    if (!token.current || activeProject.current !== projectId)
      throw new Error('正在连接本地服务，请稍后保存布局。');
    const patch = pending.current;
    pending.current = {};
    savingBytes.current = new TextEncoder().encode(JSON.stringify({ preferences: patch })).length;
    const request = api
      .savePreferences(token.current, projectId, patch)
      .then(() => {
        if (mounted.current && activeProject.current === projectId) setPreferenceError('');
      })
      .catch((failure: unknown) => {
        pending.current = { ...patch, ...pending.current };
        if (mounted.current && activeProject.current === projectId)
          setPreferenceError(errorMessage(failure));
        throw failure;
      });
    saving.current = request;
    try {
      await request;
    } finally {
      saving.current = null;
      savingBytes.current = 0;
    }
    if (Object.keys(pending.current).length) await flushPreferences();
  }, [projectId]);

  const updatePreferences = useCallback(
    (patch: PreferencePatch) => {
      if (!token.current || activeProject.current !== projectId) return;
      const normalized = normalizePreferences({ ...personal.current, ...patch });
      const changed = Object.fromEntries(
        Object.keys(patch).map((key) => [key, normalized[key as keyof PreferencePatch]]),
      ) as PreferencePatch;
      personal.current = normalized;
      setPreferences(normalized);
      pending.current = { ...pending.current, ...changed };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushPreferences().catch(() => {});
      }, 400);
    },
    [flushPreferences, projectId],
  );

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || saving.current) {
        const bytes = Math.max(
          savingBytes.current,
          new TextEncoder().encode(JSON.stringify({ preferences: pending.current })).length,
        );
        void flushPreferences().catch(() => {});
        // Small writes survive navigation via fetch keepalive. Only a large
        // graph still awaiting a non-keepalive write needs unload protection.
        if (bytes >= 60000) {
          event.preventDefault();
          event.returnValue = '';
        }
      }
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') void flushPreferences().catch(() => {});
    };
    window.addEventListener('beforeunload', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [flushPreferences]);

  const mutate: Mutate = useCallback(
    async (operation, args) => {
      if (!token.current || activeProject.current !== projectId)
        throw new Error('正在连接本地服务，请稍后再试。');
      setPendingOperations((count) => count + 1);
      try {
        const result = await api.operation(token.current, operation, args, projectId);
        if (mounted.current && activeProject.current === projectId) await refresh();
        return result;
      } finally {
        if (mounted.current) setPendingOperations((count) => count - 1);
      }
    },
    [refresh, projectId],
  );
  const registerProject = useCallback(async (root: string) => {
    if (!token.current) throw new Error('正在连接本地服务');
    return api.registerProject(token.current, root);
  }, []);
  return {
    snapshot: loaded?.projectId === projectId ? loaded.snapshot : null,
    error,
    loading,
    refresh,
    mutate,
    registerProject,
    pendingOperations,
    highlightSettings,
    preferences,
    preferencesReady,
    preferenceError,
    updatePreferences,
    flushPreferences,
  };
}
