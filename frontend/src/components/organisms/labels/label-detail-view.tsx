import { lazy, Suspense, useState } from 'react';
import { Pencil } from 'lucide-react';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LabelCategoryBadge } from '@/components/molecules/labels/label-category-badge';
import { LabelFitoFields } from '@/components/organisms/labels/label-fito-fields';
import { LabelFertilizerFields } from '@/components/organisms/labels/label-fertilizer-fields';
import { LabelFormSheet } from '@/components/organisms/labels/label-form-sheet';
import { useLabel } from '@/hooks/use-label';
import { useCanModifyLabels } from '@/hooks/use-can-modify-labels';

const PdfViewer = lazy(() =>
  import('@/components/molecules/pdf-viewer').then((m) => ({ default: m.PdfViewer })),
);

interface LabelDetailViewProps {
  readonly labelId: string;
}

/** Detail + edit/verify for a single product label, rendered as an archive tab. */
export function LabelDetailView({ labelId }: LabelDetailViewProps) {
  const canModify = useCanModifyLabels();
  const { label, isLoading, isError, saveAsync, verifyAsync, isSaving, isVerifying } = useLabel(labelId);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return <CenteredMessage text="Caricamento dettaglio…" />;
  }
  if (isError || !label) {
    return <CenteredMessage text="Impossibile caricare il dettaglio." />;
  }

  const dataPanel = (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {label.isFertilizer ? (
        <LabelFertilizerFields label={label.label} />
      ) : (
        <LabelFitoFields label={label.label} />
      )}
    </div>
  );

  const pdfPanel = (
    <Suspense fallback={null}>
      <PdfViewer url={label.sourceUrl ?? undefined} fileName={label.productName} />
    </Suspense>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">
            {label.productName} - no. {label.registrationNumber}
          </h2>
          <LabelCategoryBadge category={label.category} />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="label-verified"
              checked={label.isVerified}
              disabled={!canModify || isVerifying}
              onCheckedChange={(checked) => void verifyAsync(checked === true)}
              aria-label="Verificata"
            />
            <Label htmlFor="label-verified" className="font-normal">
              Verificata
            </Label>
          </div>
          {canModify && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              Modifica
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ResizablePanelLayout
          defaultSizes={[45, 55]}
          mobileMode="tabs"
          leftLabel="Dati"
          rightLabel="Documento"
          left={dataPanel}
          right={pdfPanel}
        />
      </div>

      {canModify && (
        <LabelFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          detail={label}
          onSave={saveAsync}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

function CenteredMessage({ text }: { readonly text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">{text}</div>
  );
}
