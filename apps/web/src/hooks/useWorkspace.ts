import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../domain';
import { api, errorMessage, type Mutate } from '../services/api';

export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const token = useRef('');
  const failures = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      let next: Snapshot;
      if (!token.current) {
        const boot = await api.bootstrap(current.signal);
        token.current = boot.token;
        next = boot.snapshot;
      } else next = await api.snapshot(current.signal);
      if (current.signal.aborted) return;
      setSnapshot((previous) =>
        previous?.revision === next.revision &&
        previous.project.head === next.project.head &&
        previous.project.workspaceId === next.project.workspaceId &&
        previous.project.branch === next.project.branch &&
        JSON.stringify(previous.claims) === JSON.stringify(next.claims)
          ? previous
          : next,
      );
      setError('');
      failures.current = 0;
    } catch (failure) {
      if (!current.signal.aborted) {
        failures.current++;
        setError(errorMessage(failure));
      }
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
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
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.current?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  const mutate: Mutate = useCallback(
    async (operation, args) => {
      if (!token.current) throw new Error('正在连接本地服务，请稍后再试。');
      const result = await api.operation(token.current, operation, args);
      await refresh();
      return result;
    },
    [refresh],
  );
  return { snapshot, error, loading, refresh, mutate };
}
