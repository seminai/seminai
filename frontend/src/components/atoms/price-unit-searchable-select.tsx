import { SearchableSelect } from '@/components/molecules/searchable-select';
import { PRICE_UNIT_OPTIONS } from '@/lib/unit-measure-options';

interface PriceUnitSearchableSelectProps {
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

export function PriceUnitSearchableSelect({
  value,
  disabled = false,
  onChange,
}: PriceUnitSearchableSelectProps) {
  return (
    <SearchableSelect
      value={value}
      options={PRICE_UNIT_OPTIONS}
      placeholder="Seleziona UDM prezzo"
      searchPlaceholder="Cerca euro / unità…"
      emptyMessage="Nessuna opzione trovata."
      disabled={disabled}
      onChange={(next) => onChange(next ?? '')}
    />
  );
}
