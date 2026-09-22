import { Warehouse, FileText, FileSpreadsheet, FileImage, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGetProductsMe } from '@/generated/api/products/products';
import { useGetProductsVerifiedPhytosanitary } from '@/generated/api/products/products';
import { mapProductToPlanning } from '@/utils/map-product-to-planning';
import type { PlanningProduct } from '@/types/planning';
import type { PlanningImportPanel } from '@/types/planning-import';

interface ImportToolbarProps {
  readonly companyId: string;
  readonly companyName: string;
  readonly activePanel: PlanningImportPanel;
  readonly onImport: (products: readonly PlanningProduct[]) => void;
  readonly onTogglePanel: (panel: PlanningImportPanel) => void;
}

export function ImportToolbar({
  companyId,
  companyName,
  activePanel,
  onImport,
  onTogglePanel,
}: ImportToolbarProps) {
  const productsMe = useGetProductsMe({ companyName });
  const verifiedPhyto = useGetProductsVerifiedPhytosanitary({ companyId });

  function handleImportMagazzino() {
    const body = productsMe.data?.data as
      | { data?: { products?: readonly Record<string, unknown>[] } }
      | undefined;
    const items = body?.data?.products ?? [];
    if (items.length === 0) return;
    onImport(items.map(mapProductToPlanning));
  }

  function handleImportNote() {
    const body = verifiedPhyto.data?.data as
      | { data?: { products?: readonly Record<string, unknown>[] } }
      | undefined;
    const items = body?.data?.products ?? [];
    if (items.length === 0) return;
    onImport(items.map(mapProductToPlanning));
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground">Importa da:</span>
      <Button
        variant={activePanel === null ? 'outline' : 'outline'}
        size="sm"
        onClick={handleImportMagazzino}
        disabled={productsMe.isLoading}
      >
        <Warehouse className="mr-1.5 h-4 w-4" />
        Magazzino
      </Button>
      <Button variant="outline" size="sm" onClick={handleImportNote} disabled={verifiedPhyto.isLoading}>
        <FileText className="mr-1.5 h-4 w-4" />
        Note
      </Button>
      <Button
        variant={activePanel === 'csv' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onTogglePanel(activePanel === 'csv' ? null : 'csv')}
      >
        <FileSpreadsheet className="mr-1.5 h-4 w-4" />
        CSV
      </Button>
      <Button
        variant={activePanel === 'ddt' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onTogglePanel(activePanel === 'ddt' ? null : 'ddt')}
      >
        <FileImage className="mr-1.5 h-4 w-4" />
        DDT
      </Button>
      <Button
        variant={activePanel === 'brogliaccio' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onTogglePanel(activePanel === 'brogliaccio' ? null : 'brogliaccio')}
      >
        <ClipboardList className="mr-1.5 h-4 w-4" />
        Brogliaccio
      </Button>
    </div>
  );
}
