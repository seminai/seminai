import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import {
  useGetWarehousesCompanyCompanyId,
  usePostWarehouses,
  getGetWarehousesCompanyCompanyIdQueryKey,
} from '@/generated/api/warehouses/warehouses';
import { useCompanies } from '@/hooks/use-company-options';

interface ProductsWizardStepTargetProps {
  readonly companyId: string;
  readonly warehouseId: string;
  readonly onCompanyChange: (id: string) => void;
  readonly onWarehouseChange: (id: string) => void;
  readonly onNext: () => void;
  readonly onCancel: () => void;
}

interface RawWarehouse {
  readonly id: string;
  readonly name: string;
}

interface CreatedWarehouseResponse {
  readonly data?: { readonly warehouse?: { readonly id?: string; readonly name?: string } };
}

export function ProductsWizardStepTarget({
  companyId,
  warehouseId,
  onCompanyChange,
  onWarehouseChange,
  onNext,
  onCancel,
}: ProductsWizardStepTargetProps) {
  const queryClient = useQueryClient();
  const { companies, isLoading: isLoadingCompanies } = useCompanies();
  const { data: response, isLoading: isLoadingWarehouses } = useGetWarehousesCompanyCompanyId(
    companyId,
    { query: { enabled: !!companyId } },
  );
  const warehouses = useMemo(() => extractWarehouses(response), [response]);

  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseAddress, setNewWarehouseAddress] = useState('');

  const createWarehouseMutation = usePostWarehouses({
    mutation: {
      onSuccess: (response) => {
        const created = response as unknown as CreatedWarehouseResponse;
        const newId = created?.data?.warehouse?.id;
        void queryClient.invalidateQueries({
          queryKey: getGetWarehousesCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Magazzino creato');
        setShowCreateWarehouse(false);
        setNewWarehouseName('');
        setNewWarehouseAddress('');
        if (newId) onWarehouseChange(newId);
      },
      onError: () => toast.error('Errore durante la creazione del magazzino'),
    },
  });

  function handleCreateWarehouse() {
    if (!newWarehouseName.trim()) {
      toast.error('Nome magazzino richiesto');
      return;
    }
    createWarehouseMutation.mutate({
      data: {
        companyId,
        name: newWarehouseName.trim(),
        address: newWarehouseAddress.trim() || undefined,
      },
    });
  }

  const isCreating = createWarehouseMutation.isPending;
  const canProceed = !!companyId && !!warehouseId;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Azienda</h2>
        {isLoadingCompanies ? (
          <p className="text-sm text-muted-foreground">Caricamento aziende...</p>
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna azienda disponibile. Crea prima un'azienda.
          </p>
        ) : (
          <Select
            value={companyId}
            onValueChange={(value) => onCompanyChange(value ?? '')}
            disabled={isCreating}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleziona azienda">
                {(value) =>
                  companies.find((c) => c.id === value)?.name ?? 'Seleziona azienda'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Magazzino</h2>
          {companyId && !showCreateWarehouse && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateWarehouse(true)}
              disabled={isCreating}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Crea nuovo
            </Button>
          )}
        </div>

        {!companyId ? (
          <p className="text-sm text-muted-foreground">Seleziona prima l'azienda.</p>
        ) : isLoadingWarehouses ? (
          <p className="text-sm text-muted-foreground">Caricamento magazzini...</p>
        ) : warehouses.length === 0 && !showCreateWarehouse ? (
          <p className="text-sm text-muted-foreground">
            Nessun magazzino. Creane uno con "Crea nuovo".
          </p>
        ) : (
          warehouses.length > 0 && (
            <Select
              value={warehouseId}
              onValueChange={(value) => onWarehouseChange(value ?? '')}
              disabled={isCreating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona magazzino">
                  {(value) =>
                    warehouses.find((w) => w.id === value)?.name ?? 'Seleziona magazzino'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        )}

        {showCreateWarehouse && (
          <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
            <FormFieldRow id="wh-new-name" label="Nome magazzino *">
              <Input
                id="wh-new-name"
                value={newWarehouseName}
                onChange={(e) => setNewWarehouseName(e.target.value)}
                disabled={isCreating}
              />
            </FormFieldRow>
            <FormFieldRow id="wh-new-addr" label="Indirizzo">
              <Input
                id="wh-new-addr"
                value={newWarehouseAddress}
                onChange={(e) => setNewWarehouseAddress(e.target.value)}
                disabled={isCreating}
              />
            </FormFieldRow>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateWarehouse(false)}
                disabled={isCreating}
              >
                Annulla
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreateWarehouse}
                disabled={isCreating}
              >
                {isCreating ? 'Creazione...' : 'Crea magazzino'}
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isCreating}>
          Annulla
        </Button>
        <Button type="button" onClick={onNext} disabled={!canProceed || isCreating}>
          Avanti
        </Button>
      </div>
    </div>
  );
}

function extractWarehouses(raw: unknown): RawWarehouse[] {
  const out: RawWarehouse[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === 'string' && typeof obj.name === 'string') {
      if (!seen.has(obj.id)) {
        seen.add(obj.id);
        out.push({ id: obj.id, name: obj.name });
      }
    }
    Object.values(obj).forEach(visit);
  };
  visit(raw);
  return out;
}
