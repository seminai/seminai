import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/molecules/confirm-delete-dialog";
import { useDeleteCompaniesIdAll } from "@/generated/api/companies/companies";
import { CompanyRole } from "@/generated/prisma/enums";
import { useCompanyRole } from "@/hooks/use-company-role";
import { useTabs } from "@/hooks/use-tabs";
import {
  isCompanyScopedTabId,
  shouldInvalidateCompanyDeleteQuery,
} from "@/lib/company-delete-ui";
import { DELETE_CONFIRMATION_TEXT } from "@/lib/delete-confirmation";

interface CompanyDeleteButtonProps {
  readonly companyId: string;
  readonly companyName: string;
}

export function CompanyDeleteButton({
  companyId,
  companyName,
}: CompanyDeleteButtonProps) {
  const queryClient = useQueryClient();
  const { tabs, removeTab } = useTabs();
  const { role, isLoading } = useCompanyRole(companyId);
  const [open, setOpen] = useState(false);
  const deleteMutation = useDeleteCompaniesIdAll({
    mutation: {
      onSuccess: () => {
        void handleDeleteSuccess();
      },
      onError: (error: unknown) => {
        toast.error("Errore durante l'eliminazione dell'azienda", {
          description:
            error instanceof Error ? error.message : "Riprova più tardi",
        });
      },
    },
  });
  const handleDeleteSuccess = async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => shouldInvalidateCompanyDeleteQuery(query.queryKey),
    });
    const toClose = tabs.filter((tab) =>
      isCompanyScopedTabId(tab.id, [companyId]),
    );
    for (const tab of toClose) {
      await removeTab(tab.id);
    }
    toast.success("Azienda eliminata");
    setOpen(false);
  };
  if (isLoading || role !== CompanyRole.ADMIN) return null;
  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        Elimina azienda
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Elimina azienda"
        description={`Sei sicuro di voler eliminare tutta l'azienda selezionata? "${companyName}" e tutti i dati collegati saranno rimossi.`}
        isPending={deleteMutation.isPending}
        confirmationText={DELETE_CONFIRMATION_TEXT}
        confirmationLabel={`Digita ${DELETE_CONFIRMATION_TEXT} per confermare`}
        onConfirm={() => deleteMutation.mutate({ id: companyId })}
      />
    </>
  );
}
