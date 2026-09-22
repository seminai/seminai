import { useMemo, useState } from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { useExtractionsByCompany, useDeleteExtraction } from '@/hooks/use-extractions';
import { useCompanyRole } from '@/hooks/use-company-role';
import { FileUploadDialog } from '@/components/organisms/file-upload-dialog';

interface FileRow {
  readonly id: string;
  readonly fileName: string;
  readonly category: string;
  readonly status: string;
  readonly date: string;
}

interface CompanyFilesSectionProps {
  readonly companyId: string;
}

export function CompanyFilesSection({ companyId }: CompanyFilesSectionProps) {
  const { canManage } = useCompanyRole(companyId);
  const { data: extractions } = useExtractionsByCompany(companyId);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<FileRow | null>(null);

  const files = useMemo<FileRow[]>(() => {
    if (!extractions) return [];
    return extractions.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      category: e.category,
      status: e.status,
      date: new Date(e.updatedAt).toLocaleDateString('it-IT'),
    }));
  }, [extractions]);

  const deleteMutation = useDeleteExtraction();

  const headers = canManage
    ? ['File', 'Categoria', 'Stato', 'Data', '']
    : ['File', 'Categoria', 'Stato', 'Data'];

  const rows = files.map((f) => {
    const cells: React.ReactNode[] = [f.fileName, f.category, f.status, f.date];
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
            <DropdownMenuItem onClick={() => setDeleting(f)}>
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
        title="File caricati"
        count={files.length}
        action={
          canManage ? (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Carica file
            </Button>
          ) : undefined
        }
      >
        {files.length === 0 ? <EmptyState /> : <SimpleTable headers={headers} rows={rows} />}
      </Section>

      {canManage && (
        <>
          <FileUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
          <ConfirmDeleteDialog
            open={!!deleting}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Elimina file"
            description={
              deleting
                ? `Vuoi eliminare "${deleting.fileName}"? L'operazione è irreversibile.`
                : ''
            }
            isPending={deleteMutation.isPending}
            onConfirm={() => {
              if (!deleting) return;
              deleteMutation.mutate(deleting.id, {
                onSuccess: () => {
                  toast.success('File eliminato');
                  setDeleting(null);
                },
                onError: () => {
                  toast.error("Errore durante l'eliminazione del file");
                  setDeleting(null);
                },
              });
            }}
          />
        </>
      )}
    </>
  );
}
