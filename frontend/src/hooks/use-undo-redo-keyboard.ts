import { useEffect } from 'react';

interface UseUndoRedoKeyboardOptions {
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly enabled?: boolean;
}

/**
 * Binds Ctrl+Z / Ctrl+Y (Cmd on Mac) to undo/redo callbacks.
 * Designed to complement AG Grid's native undo — the caller decides
 * whether to delegate to AG Grid or to a custom history stack.
 */
export function useUndoRedoKeyboard({
  onUndo,
  onRedo,
  enabled = true,
}: UseUndoRedoKeyboardOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        onRedo();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, onUndo, onRedo]);
}
