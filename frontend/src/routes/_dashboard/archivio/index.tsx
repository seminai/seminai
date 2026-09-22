import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArchiveDocumentsTab } from "@/components/organisms/archive/archive-documents-tab";
import { LabelsTable } from "@/components/organisms/labels/labels-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/hooks/use-workspace";

type ArchiveTab = "documenti" | "etichette";

interface ArchiveSearch {
  readonly companyId?: string;
  readonly companyName?: string;
  readonly tab?: ArchiveTab;
}

export const Route = createFileRoute("/_dashboard/archivio/")({
  component: ArchivioPage,
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => ({
    companyId:
      typeof search.companyId === "string" ? search.companyId : undefined,
    companyName:
      typeof search.companyName === "string" ? search.companyName : undefined,
    tab: search.tab === "etichette" ? "etichette" : undefined,
  }),
});

function ArchivioPage() {
  const { companyId, tab } = Route.useSearch();
  const navigate = useNavigate();
  const { hasModule } = useWorkspace();
  const { addTab } = useTabs();
  const showLabels = hasModule("LABELS");

  if (!showLabels) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col p-2 sm:p-4 md:p-6">
        <ArchiveDocumentsTab companyId={companyId} />
      </div>
    );
  }

  const activeTab: ArchiveTab = tab ?? "documenti";

  return (
    <div className="flex h-full min-h-0 w-full flex-col p-2 sm:p-4 md:p-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          void navigate({
            to: "/archivio",
            search: (prev) => ({ ...prev, tab: value === "etichette" ? "etichette" : undefined }),
          })
        }
        className="min-h-0 flex-1"
      >
        <TabsList>
          <TabsTrigger value="documenti">Documenti</TabsTrigger>
          <TabsTrigger value="etichette">Etichette</TabsTrigger>
        </TabsList>
        <TabsContent value="documenti" className="min-h-0">
          <ArchiveDocumentsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="etichette" className="flex min-h-0 flex-col">
          <LabelsTable
            onRowClick={(row) =>
              addTab({
                id: `label-${row.id}`,
                title: row.productName || "Etichetta",
                subtitle: row.registrationNumber,
                format: "-",
                source: "archivio",
              })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
