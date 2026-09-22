import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { useGetMachinesCompanyCompanyId } from '@/generated/api/machines/machines';
import { useGetUserOnCompanyCompanyCompanyId } from '@/generated/api/user-on-company/user-on-company';
import { extractArray } from '@/lib/api-response';
import { toNonEmptyString } from '@/lib/string';
import type { AutoPlanConfig, DosageStrategy, OrchestratorConfig } from '@/types/planning';

interface AutoConfigPanelProps {
  readonly companyId: string;
  readonly config: AutoPlanConfig;
  readonly onChange: (update: Partial<AutoPlanConfig>) => void;
}

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

const STRATEGY_OPTIONS = [
  { value: 'avg', label: 'Media (avg)' },
  { value: 'min', label: 'Minimo (min)' },
  { value: 'max', label: 'Massimo (max)' },
  { value: 'current', label: 'Corrente (current)' },
] as const;

const OBJECTIVE_OPTIONS = [
  { value: 'balanced', label: 'Bilanciato' },
  { value: 'minimize_interventions', label: 'Minimizza interventi' },
  { value: 'maximize_coverage', label: 'Massima copertura' },
  { value: 'cost_effective', label: 'Costo-efficace' },
] as const;

const INTENSITY_OPTIONS = [
  { value: '', label: 'Nessun limite' },
  { value: 'low', label: 'Bassa (1-3 prodotti/UP)' },
  { value: 'medium', label: 'Media (4-6 prodotti/UP)' },
  { value: 'high', label: 'Alta (7-10 prodotti/UP)' },
] as const;

function updateOrchestrator(
  config: AutoPlanConfig,
  field: keyof OrchestratorConfig,
  value: unknown,
): Partial<AutoPlanConfig> {
  return { orchestrator: { ...config.orchestrator, [field]: value } };
}

export function AutoConfigPanel({ companyId, config, onChange }: AutoConfigPanelProps) {
  const machines = useGetMachinesCompanyCompanyId(companyId, {
    query: { enabled: Boolean(companyId) },
  });
  const operators = useGetUserOnCompanyCompanyCompanyId(companyId, {
    query: { enabled: Boolean(companyId) },
  });

  const machineOptions = useMemo(() => {
    return extractArray(machines.data?.data, 'machines')
      .map((machine): SelectOption | null => {
        const id = toNonEmptyString(machine.id);
        if (!id) return null;
        const name = toNonEmptyString(machine.name);
        return {
          value: id,
          label: name || id,
        };
      })
      .filter((option): option is SelectOption => option !== null);
  }, [machines.data]);

  const operatorOptions = useMemo(() => {
    return extractArray(operators.data?.data, 'users', 'usersOnCompany')
      .map((operator): SelectOption | null => {
        const user = operator.user as Record<string, unknown> | undefined;
        const id = toNonEmptyString(user?.id ?? operator.userId);
        if (!id) return null;
        const name = toNonEmptyString(user?.name);
        const email = toNonEmptyString(user?.email);
        return {
          value: id,
          label: name || email || id,
        };
      })
      .filter((option): option is SelectOption => option !== null);
  }, [operators.data]);

  return (
    <div className="flex flex-col gap-5 rounded-lg border p-4">
      <h4 className="text-sm font-semibold">Configurazione</h4>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Strategia globale
          </label>
          <SearchableSelect
            value={config.strategy ?? ''}
            options={STRATEGY_OPTIONS.map((o) => ({ ...o }))}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca..."
            emptyMessage="-"
            onChange={(v) => onChange({ strategy: (v as DosageStrategy) || undefined })}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Obiettivo
          </label>
          <SearchableSelect
            value={config.orchestrator.objective ?? 'balanced'}
            options={OBJECTIVE_OPTIONS.map((o) => ({ ...o }))}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca..."
            emptyMessage="-"
            onChange={(v) => onChange(updateOrchestrator(config, 'objective', v || 'balanced'))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Intensita
          </label>
          <SearchableSelect
            value={config.orchestrator.intensity ?? ''}
            options={INTENSITY_OPTIONS.map((o) => ({ ...o }))}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca..."
            emptyMessage="-"
            onChange={(v) => onChange(updateOrchestrator(config, 'intensity', v || undefined))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Data inizio
          </label>
          <Input
            type="date"
            value={config.startAt}
            onChange={(e) => onChange({ startAt: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Data fine
          </label>
          <Input
            type="date"
            value={config.endAt}
            onChange={(e) => onChange({ endAt: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Note agronomiche (opzionale)
        </label>
        <Textarea
          placeholder="Es: Pressione oidio alta, evitare rame..."
          value={config.orchestrator.agronomicNotes ?? ''}
          onChange={(e) => onChange(updateOrchestrator(config, 'agronomicNotes', e.target.value || undefined))}
          rows={2}
        />
      </div>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={config.outStockLimiter}
          onCheckedChange={(checked) => onChange({ outStockLimiter: checked === true })}
        />
        <span className="text-sm">Limita ai prodotti in stock</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Macchinario (opzionale)
          </label>
          <SearchableSelect
            value={config.machines[0]?.machineId ?? ''}
            options={machineOptions}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca macchinario..."
            emptyMessage="Nessun macchinario."
            onChange={(v) =>
              onChange({
                machines: v ? [{ companyId, machineId: v }] : [],
              })
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Operatore (opzionale)
          </label>
          <SearchableSelect
            value={config.operators[0]?.userId ?? ''}
            options={operatorOptions}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca operatore..."
            emptyMessage="Nessun operatore."
            onChange={(v) =>
              onChange({
                operators: v ? [{ companyId, userId: v }] : [],
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
