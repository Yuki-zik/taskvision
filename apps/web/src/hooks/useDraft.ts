import { useEffect, useState } from 'react';

// REUSE: Editors keep their original revision/hash with their draft, never rebase during polling.
export function useDraft<T>(key: string, initial: T) {
  const [draft, setDraft] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
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
