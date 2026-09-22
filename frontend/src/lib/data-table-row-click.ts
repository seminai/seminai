/**
 * Returns true when the click target is inside an interactive control so the row
 * should not run selection / navigation (inputs, selects, checkboxes, links, etc.).
 */
export function shouldIgnoreDataTableRowClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, [role="combobox"], [role="listbox"], [role="checkbox"], [role="switch"]',
    ),
  );
}
