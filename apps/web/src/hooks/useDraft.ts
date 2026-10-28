import { useEffect, useRef, useState } from 'react';

// REUSE: Editors keep their original revision/hash with their draft, never rebase during polling.
interface LegacyDraft<T> {
  key: string;
  accepts: (value: unknown) => value is T;
}
export function useDraft<T>(key: string, initial: T, legacy?: LegacyDraft<T>) {
  const migratedFrom = useRef<string | null>(null);
  const [draft, setDraft] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as T;
      // Preserve a compatible older draft while moving to a more precise anchor key.
      // Leave unrelated legacy drafts untouched so a different source line cannot claim them.
      if (legacy) {
        const previous = localStorage.getItem(legacy.key);
        if (previous !== null) {
          const candidate: unknown = JSON.parse(previous);
          if (legacy.accepts(candidate)) {
            migratedFrom.current = legacy.key;
            return candidate;
          }
        }
      }
      return initial;
    } catch {
      return initial;
    }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      if (migratedFrom.current) {
        localStorage.removeItem(migratedFrom.current);
        migratedFrom.current = null;
      }
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [key, draft]);
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Current draft remains in memory. */
    }
  };
  return { draft, setDraft, clear, storageError };
}
