import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCompanies } from '@/hooks/use-company-options';
import type { WorkspaceKind } from '@/types/workspace';

interface WorkspaceCompanyPickerProps {
  readonly kind: WorkspaceKind;
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  readonly disabled?: boolean;
}

export function WorkspaceCompanyPicker({
  kind,
  selectedIds,
  onChange,
  disabled = false,
}: WorkspaceCompanyPickerProps) {
  const { companies, isLoading } = useCompanies({ scope: 'all' });
  const [search, setSearch] = useState('');

  const eligibleCompanies = useMemo(
    () => companies.filter((company) => company.kind === kind),
    [companies, kind],
  );

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return eligibleCompanies;
    return eligibleCompanies.filter((company) => company.name.toLowerCase().includes(term));
  }, [eligibleCompanies, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleCompany(companyId: string, checked: boolean) {
    if (checked) {
      onChange([...selectedIds, companyId]);
      return;
    }
    onChange(selectedIds.filter((id) => id !== companyId));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Aziende in questo workspace</Label>
        <p className="text-xs text-muted-foreground">
          Se non selezioni nessuna azienda, saranno visibili tutte quelle a cui hai accesso.
        </p>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Cerca azienda..."
        disabled={disabled || isLoading}
      />

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Caricamento aziende...</p>
        ) : filteredCompanies.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {eligibleCompanies.length === 0
              ? 'Nessuna azienda compatibile con il tipo di workspace selezionato.'
              : 'Nessun risultato per la ricerca.'}
          </p>
        ) : (
          filteredCompanies.map((company) => {
            const checkboxId = `workspace-company-${company.id}`;
            return (
              <label
                key={company.id}
                htmlFor={checkboxId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
              >
                <Checkbox
                  id={checkboxId}
                  checked={selectedSet.has(company.id)}
                  onCheckedChange={(checked) => toggleCompany(company.id, checked === true)}
                  disabled={disabled}
                />
                <span className="truncate text-sm">{company.name}</span>
              </label>
            );
          })
        )}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} aziend{selectedIds.length === 1 ? 'a selezionata' : 'e selezionate'}
        </p>
      )}
    </div>
  );
}
