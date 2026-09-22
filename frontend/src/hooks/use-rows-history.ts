import { useCallback, useMemo, useRef, useState } from 'react';

interface UseRowsHistoryOptions<T> {
  readonly initialState: readonly T[];
  readonly maxHistory?: number;
}

interface UseRowsHistoryReturn<T> {
  readonly push: (snapshot: readonly T[]) => void;
  readonly undo: () => readonly T[] | undefined;
  readonly redo: () => readonly T[] | undefined;
  readonly reset: (newInitial: readonly T[]) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

const DEFAULT_MAX_HISTORY = 20;

/**
 * Lightweight history stack for bulk row operations (paste, add-row, restore).
 * Complements AG Grid's built-in `UndoRedoEditModule` which only tracks
 * individual cell edits.
 */
export function useRowsHistory<T>(
  options: UseRowsHistoryOptions<T>,
): UseRowsHistoryReturn<T> {
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
  const stackRef = useRef<Array<readonly T[]>>([options.initialState]);
  const [cursor, setCursor] = useState(0);
  const [stackLength, setStackLength] = useState(1);

  const push = useCallback(
    (snapshot: readonly T[]) => {
      const stack = stackRef.current;
      const current = stack[cursor];
      if (current && JSON.stringify(current) === JSON.stringify(snapshot)) return;

      const truncated = stack.slice(0, cursor + 1);
      truncated.push(snapshot);

      if (truncated.length > maxHistory) truncated.shift();

      stackRef.current = truncated;
      setStackLength(truncated.length);
      setCursor(truncated.length - 1);
    },
    [cursor, maxHistory],
  );

  const undo = useCallback((): readonly T[] | undefined => {
    if (cursor <= 0) return undefined;
    const next = cursor - 1;
    setCursor(next);
    return stackRef.current[next];
  }, [cursor]);

  const redo = useCallback((): readonly T[] | undefined => {
    if (cursor >= stackRef.current.length - 1) return undefined;
    const next = cursor + 1;
    setCursor(next);
    return stackRef.current[next];
  }, [cursor]);

  const reset = useCallback((newInitial: readonly T[]) => {
    stackRef.current = [newInitial];
    setStackLength(1);
    setCursor(0);
  }, []);

  return useMemo(
    () => ({
      push,
      undo,
      redo,
      reset,
      canUndo: cursor > 0,
      canRedo: cursor < stackLength - 1,
    }),
    [cursor, push, redo, reset, stackLength, undo],
  );
}
