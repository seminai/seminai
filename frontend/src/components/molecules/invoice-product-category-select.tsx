import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { ExtractionCategoryOption } from '@/lib/extraction-product-category';

interface InvoiceProductCategorySelectProps {
  readonly value: string;
  readonly options: readonly ExtractionCategoryOption[];
  readonly disabled?: boolean;
  readonly allowCustomInput?: boolean;
  readonly className?: string;
  readonly onChange: (value: string) => void;
}

const CUSTOM_OPTION_VALUE = '__custom__';

export function InvoiceProductCategorySelect({
  value,
  options,
  disabled = false,
  allowCustomInput = false,
  className,
  onChange,
}: InvoiceProductCategorySelectProps) {
  const optionValues = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const enumOptions = useMemo(
    () => options.filter((option) => option.group === 'enum'),
    [options],
  );
  const customOptions = useMemo(
    () => options.filter((option) => option.group === 'custom'),
    [options],
  );
  const isKnownValue = optionValues.has(value);
  const [customDraft, setCustomDraft] = useState(
    () => (allowCustomInput && value && !isKnownValue ? value : ''),
  );
  const selectValue =
    allowCustomInput && value && !isKnownValue ? CUSTOM_OPTION_VALUE : value || options[0]?.value || '';

  function handleSelectChange(nextValue: string): void {
    if (nextValue === CUSTOM_OPTION_VALUE) {
      onChange(customDraft.trim() || value);
      return;
    }
    onChange(nextValue);
  }

  function handleCustomDraftChange(nextValue: string): void {
    setCustomDraft(nextValue);
    onChange(nextValue.trim());
  }

  return (
    <div className="space-y-1">
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(event) => handleSelectChange(event.target.value)}
        className={className ?? 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'}
      >
        {enumOptions.length > 0 ? (
          <optgroup label="Categorie">
            {enumOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {customOptions.length > 0 ? (
          <optgroup label="Tipi azienda">
            {customOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {allowCustomInput ? (
          <option value={CUSTOM_OPTION_VALUE}>Nuovo tipo…</option>
        ) : null}
      </select>
      {allowCustomInput && selectValue === CUSTOM_OPTION_VALUE ? (
        <Input
          value={customDraft}
          disabled={disabled}
          placeholder="Es. Lamiera"
          onChange={(event) => handleCustomDraftChange(event.target.value)}
          className="h-8 text-xs"
        />
      ) : null}
    </div>
  );
}
