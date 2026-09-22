import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import type { DateRange } from '@/components/organisms/manual-add/production-units-wizard-types';

interface ProductionUnitsWizardStepContextProps {
  readonly companyId: string;
  readonly companies: readonly { value: string; label: string }[];
  readonly isLoadingCompanies: boolean;
  readonly dateRange: DateRange;
  readonly hasSearched: boolean;
  readonly disabled?: boolean;
  readonly onCompanyChange: (companyId: string) => void;
  readonly onDateRangeChange: (range: DateRange) => void;
  readonly onSearch: () => void;
  readonly onNext: () => void;
  readonly onCancel: () => void;
}

export function ProductionUnitsWizardStepContext({
  companyId,
  companies,
  isLoadingCompanies,
  dateRange,
  hasSearched,
  disabled,
  onCompanyChange,
  onDateRangeChange,
  onSearch,
  onNext,
  onCancel,
}: ProductionUnitsWizardStepContextProps) {
  const canProceed = Boolean(companyId && dateRange.start && dateRange.end && hasSearched);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Azienda</h2>
        {isLoadingCompanies ? (
          <p className="text-sm text-muted-foreground">Caricamento aziende...</p>
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna azienda disponibile. Crea prima un&apos;azienda.
          </p>
        ) : (
          <SearchableSelect
            value={companyId}
            options={companies}
            placeholder="Seleziona azienda"
            searchPlaceholder="Cerca azienda..."
            emptyMessage="Nessuna azienda trovata."
            disabled={disabled}
            onChange={(value) => onCompanyChange(value ?? '')}
          />
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Periodo unità produttiva</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormFieldRow id="pu-period-start" label="Data inizio">
            <Input
              id="pu-period-start"
              type="date"
              value={dateRange.start}
              disabled={disabled}
              onChange={(event) =>
                onDateRangeChange({ ...dateRange, start: event.target.value })
              }
            />
          </FormFieldRow>
          <FormFieldRow id="pu-period-end" label="Data fine">
            <Input
              id="pu-period-end"
              type="date"
              value={dateRange.end}
              disabled={disabled}
              onChange={(event) =>
                onDateRangeChange({ ...dateRange, end: event.target.value })
              }
            />
          </FormFieldRow>
        </div>
        <Button
          type="button"
          className="mt-3"
          variant="secondary"
          disabled={disabled || !companyId || !dateRange.start || !dateRange.end}
          onClick={onSearch}
        >
          Cerca campi disponibili
        </Button>
        {hasSearched ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Disponibilità caricata per il periodo selezionato.
          </p>
        ) : null}
      </section>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>
          Annulla
        </Button>
        <Button type="button" disabled={disabled || !canProceed} onClick={onNext}>
          Continua
        </Button>
      </div>
    </div>
  );
}
