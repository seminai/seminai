interface UnitOfMeasureSelectProps {
  readonly value: string | null;
  readonly options: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (next: string | null) => void;
}

/**
 * Closed-vocabulary unit-of-measure dropdown.
 *
 * If the current value is not in `options` (legacy data from an older
 * extraction), it is surfaced as a disabled first entry suffixed with
 * "(non canonico)" so the user can still see the original value but is
 * forced to pick a canonical one before saving.
 */
export function UnitOfMeasureSelect({
  value,
  options,
  disabled,
  onChange,
}: UnitOfMeasureSelectProps) {
  const trimmed = value?.trim() ?? '';
  const upper = trimmed.toUpperCase();
  const isCanonical = options.includes(upper);
  const selectValue = isCanonical ? upper : trimmed;
  return (
    <select
      value={selectValue}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
    >
      {!trimmed && <option value="">—</option>}
      {trimmed && !isCanonical && (
        <option value={trimmed} disabled>
          {trimmed} (non canonico)
        </option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
