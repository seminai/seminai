import { useEffect, type RefObject } from 'react';
import type { InvoiceCellOperation } from '@/lib/invoice-cell-operations';

interface UseInvoiceOcrShortcutsOptions {
  readonly enabled: boolean;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly onAction: (operation: InvoiceCellOperation) => void;
}

export function useInvoiceOcrShortcuts({
  enabled,
  rootRef,
  onAction,
}: UseInvoiceOcrShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const root = rootRef.current;
      const active = document.activeElement;
      if (!root || !(active instanceof HTMLElement) || !root.contains(active)) return;
      if (isEditableElement(active)) return;
      if (!event.altKey || event.metaKey || event.ctrlKey) return;

      const operation = getShortcutOperation(event);
      if (!operation) return;

      event.preventDefault();
      onAction(operation);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onAction, rootRef]);
}

function getShortcutOperation(event: KeyboardEvent): InvoiceCellOperation | null {
  if (event.key === 'ArrowUp') return event.shiftKey ? 'copy-above' : 'move-up';
  if (event.key === 'ArrowDown') return event.shiftKey ? 'copy-below' : 'move-down';
  return null;
}

function isEditableElement(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  );
}
