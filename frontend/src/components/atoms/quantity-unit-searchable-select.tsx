import { SearchableSelect } from '@/components/molecules/searchable-select';
import { QUANTITY_UNIT_OPTIONS } from '@/lib/unit-measure-options';

interface QuantityUnitSearchableSelectProps {
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

export function QuantityUnitSearchableSelect({
  value,
  disabled = false,
  onChange,
}: QuantityUnitSearchableSelectProps) {
  return (
    <SearchableSelect
      value={value}
      options={QUANTITY_UNIT_OPTIONS}
      placeholder="Seleziona unità"
      searchPlaceholder="Cerca unità…"
      emptyMessage="Nessuna unità trovata."
      disabled={disabled}
      onChange={(next) => onChange(next ?? '')}
    />
  );
}
