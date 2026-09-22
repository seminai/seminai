import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { OTHER_SELECT_VALUE } from '@/components/organisms/manual-add/production-unit-form-options';

interface SearchableSelectWithOtherProps {
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string; readonly description?: string; readonly searchKeywords?: string }[];
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly allowOther?: boolean;
  readonly otherPlaceholder?: string;
  readonly onChange: (value: string) => void;
}

function resolveSelectValue(value: string, optionValues: ReadonlySet<string>): string {
  if (!value) return '';
  if (optionValues.has(value)) return value;
  return OTHER_SELECT_VALUE;
}

export function SearchableSelectWithOther({
  value,
  options,
  placeholder,
  disabled = false,
  searchPlaceholder = 'Cerca...',
  emptyMessage = 'Nessun risultato.',
  allowOther = true,
  otherPlaceholder = 'Specifica valore',
  onChange,
}: SearchableSelectWithOtherProps) {
  const optionValues = useMemo(() => new Set(options.map((o) => o.value)), [options]);
  const selectOptions = useMemo(() => {
    const base = [...options];
    if (allowOther) {
      base.push({ value: OTHER_SELECT_VALUE, label: 'Altro' });
    }
    return base;
  }, [allowOther, options]);

  const selectValue = resolveSelectValue(value, optionValues);
  const showOtherInput = allowOther && selectValue === OTHER_SELECT_VALUE;

  return (
    <div className="space-y-2">
      <SearchableSelect
        value={selectValue}
        options={selectOptions}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        disabled={disabled}
        onChange={(next) => {
          if (!next || next === OTHER_SELECT_VALUE) {
            onChange('');
            return;
          }
          onChange(next);
        }}
      />
      {showOtherInput ? (
        <Input
          value={value}
          placeholder={otherPlaceholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
