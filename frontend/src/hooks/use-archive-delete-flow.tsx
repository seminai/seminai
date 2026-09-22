import { useCallback, useMemo, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/molecules/confirm-delete-dialog";
import { useDeleteCompaniesBulkAll } from "@/generated/api/companies/companies";
import { useDeleteFilesBulk } from "@/generated/api/files/files";
import {
  removeExtractionsFromCaches,
  restoreExtractionCaches,
  type CacheSnapshot,
} from "@/lib/extraction-cache";
import {
  planArchiveDeletion,
  type ArchiveDeletePlan,
} from "@/lib/archive-delete-planner";
import {
  isCompanyScopedTabId,
  shouldInvalidateCompanyDeleteQuery,
} from "@/lib/company-delete-ui";
import { DELETE_CONFIRMATION_TEXT } from "@/lib/delete-confirmation";
import { useTabs, type TabData } from "@/hooks/use-tabs";
import type { ArchiveRow } from "@/types/extraction";

interface ArchiveDeleteFlow {
  readonly requestDelete: (rows: readonly ArchiveRow[]) => void;
  readonly dialog: React.ReactNode;
}

interface UseArchiveDeleteFlowOptions {
  readonly onDeleteSuccess?: () => void;
}

type MutationContext = { readonly snapshots: readonly CacheSnapshot[] };

export function useArchiveDeleteFlow(
  options: UseArchiveDeleteFlowOptions = {},
): ArchiveDeleteFlow {
  const queryClient = useQueryClient();
  const { tabs, removeTab } = useTabs();
  const [pending, setPending] = useState<ArchiveDeletePlan | null>(null);
  const { onDeleteSuccess } = options;
  const deleteFiles = useDeleteFilesBulk({
    mutation: {
      onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey: ["extractions"] });
        const { snapshots } = removeExtractionsFromCaches(queryClient, {
          fileIds: variables.data.ids ?? [],
          extractionIds: variables.data.extractionIds ?? [],
        });
        return { snapshots } satisfies MutationContext;
      },
      onError: (_error: unknown, _variables, context) => {
        const ctx = context as MutationContext | undefined;
        if (ctx) restoreExtractionCaches(queryClient, ctx.snapshots);
      },
      onSettled: () => {
        void invalidateDeleteCaches(queryClient);
      },
    },
  });
  const deleteCompanies = useDeleteCompaniesBulkAll();

  const executeDelete = useCallback(
    async (plan: ArchiveDeletePlan) => {
      try {
        if (plan.companyDelete) {
          await deleteCompanies.mutateAsync({
            data: { companyIds: [...plan.companyDelete.companyIds] },
          });
        }
        for (const fileDelete of plan.fileDeletes) {
          await deleteFiles.mutateAsync({
            data: {
              ids: [...fileDelete.fileIds],
              extractionIds: [...fileDelete.extractionIds],
              companyId: fileDelete.companyId,
              cascade: fileDelete.cascade,
            },
          });
        }
        await closeDeletedCompanyTabs(
          tabs,
          removeTab,
          plan.companyDelete?.companyIds ?? [],
        );
        await invalidateDeleteCaches(queryClient);
        toast.success("Eliminazione completata");
        setPending(null);
        onDeleteSuccess?.();
      } catch (error) {
        toast.error("Errore eliminazione", {
          description:
            error instanceof Error ? error.message : "Riprova più tardi",
        });
        setPending(null);
      }
    },
    [
      deleteCompanies,
      deleteFiles,
      onDeleteSuccess,
      queryClient,
      removeTab,
      tabs,
    ],
  );

  const requestDelete = useCallback((rows: readonly ArchiveRow[]) => {
    const plan = planArchiveDeletion(rows);
    if (!plan) {
      toast.info("Nessun elemento eliminabile", {
        description:
          "Le righe selezionate non possono essere eliminate da qui.",
      });
      return;
    }
    setPending(plan);
  }, []);

  const dialog = useMemo(() => {
    if (!pending) return null;
    return (
      <ConfirmDeleteDialog
        open
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Conferma eliminazione"
        description={pending.description}
        isPending={deleteFiles.isPending || deleteCompanies.isPending}
        confirmationText={DELETE_CONFIRMATION_TEXT}
        confirmationLabel={`Digita ${DELETE_CONFIRMATION_TEXT} per confermare`}
        onConfirm={() => executeDelete(pending)}
      />
    );
  }, [
    pending,
    deleteCompanies.isPending,
    deleteFiles.isPending,
    executeDelete,
  ]);

  return { requestDelete, dialog };
}

async function invalidateDeleteCaches(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: shouldInvalidateDeleteQuery,
  });
}

function shouldInvalidateDeleteQuery(query: {
  readonly queryKey: readonly unknown[];
}): boolean {
  return shouldInvalidateCompanyDeleteQuery(query.queryKey);
}

async function closeDeletedCompanyTabs(
  tabs: readonly TabData[],
  removeTab: (id: string) => Promise<void>,
  companyIds: readonly string[],
): Promise<void> {
  const toClose = tabs.filter((tab) => isCompanyScopedTab(tab.id, companyIds));
  for (const tab of toClose) {
    await removeTab(tab.id);
  }
}

function isCompanyScopedTab(
  tabId: string,
  companyIds: readonly string[],
): boolean {
  return isCompanyScopedTabId(tabId, companyIds);
}
