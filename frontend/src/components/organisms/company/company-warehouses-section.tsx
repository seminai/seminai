import { useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Section, SimpleTable, EmptyState } from '@/components/molecules/section-table';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import {
  useGetWarehousesCompanyCompanyId,
  useDeleteWarehousesId,
  getGetWarehousesCompanyCompanyIdQueryKey,
} from '@/generated/api/warehouses/warehouses';
import { extractArray } from '@/lib/api-response';
import { useCompanyRole } from '@/hooks/use-company-role';
import {
  WarehouseFormSheet,
  type WarehouseInitialData,
} from '@/components/organisms/company/warehouse-form-sheet';

interface CompanyWarehousesSectionProps {
  readonly companyId: string;
}

const stringField = (raw: Record<string, unknown>, key: string): string | undefined =>
  typeof raw[key] === 'string' ? (raw[key] as string) : undefined;

export function CompanyWarehousesSection({ companyId }: CompanyWarehousesSectionProps) {
  const queryClient = useQueryClient();
  const { canManage } = useCompanyRole(companyId);
  const { data: warehousesRes } = useGetWarehousesCompanyCompanyId(companyId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseInitialData | null>(null);
  const [deleting, setDeleting] = useState<WarehouseInitialData | null>(null);

  const warehouses = useMemo<WarehouseInitialData[]>(() => {
    if (!warehousesRes?.data) return [];
    return extractArray(warehousesRes.data, 'warehouses').map((w) => ({
      id: String(w.id ?? ''),
      name: stringField(w, 'name'),
      address: stringField(w, 'address'),
      city: stringField(w, 'city'),
      region: stringField(w, 'region'),
      nation: stringField(w, 'nation'),
      cap: stringField(w, 'cap'),
      sezione: stringField(w, 'sezione'),
      foglio: stringField(w, 'foglio'),
      particella: stringField(w, 'particella'),
      subalterno: stringField(w, 'subalterno'),
    }));
  }, [warehousesRes]);

  const deleteMutation = useDeleteWarehousesId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetWarehousesCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Magazzino eliminato');
        setDeleting(null);
      },
      onError: () => toast.error("Errore durante l'eliminazione del magazzino"),
    },
  });

  const headers = canManage ? ['Nome', 'Città', 'Indirizzo', ''] : ['Nome', 'Città', 'Indirizzo'];

  const rows = warehouses.map((w) => {
    const cells: React.ReactNode[] = [w.name ?? '-', w.city ?? '-', w.address ?? '-'];
    if (canManage) {
      cells.push(
        <DropdownMenu key="actions">
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Azioni"
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(w)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleting(w)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    }
    return cells;
  });

  return (
    <>
      <Section
        title="Magazzini"
        count={warehouses.length}
        action={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Aggiungi magazzino
            </Button>
          ) : undefined
        }
      >
        {warehouses.length === 0 ? <EmptyState /> : <SimpleTable headers={headers} rows={rows} />}
      </Section>

      {canManage && (
        <>
          <WarehouseFormSheet
            companyId={companyId}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
          <WarehouseFormSheet
            companyId={companyId}
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
            initialData={editing}
          />
          <ConfirmDeleteDialog
            open={!!deleting}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Elimina magazzino"
            description={
              deleting
                ? `Vuoi eliminare il magazzino "${deleting.name ?? deleting.id}"? L'operazione è irreversibile.`
                : ''
            }
            isPending={deleteMutation.isPending}
            onConfirm={() => {
              if (deleting) deleteMutation.mutate({ id: deleting.id });
            }}
          />
        </>
      )}
    </>
  );
}
