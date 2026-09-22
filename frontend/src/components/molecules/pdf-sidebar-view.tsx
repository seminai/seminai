import { lazy, Suspense } from 'react';
import { ArrowLeft, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PdfViewer = lazy(() =>
  import('@/components/molecules/pdf-viewer').then((m) => ({ default: m.PdfViewer })),
);

interface PdfSidebarViewProps {
  readonly url: string;
  readonly fileName: string;
  readonly subtitle: string;
  readonly onBack: () => void;
  readonly onClose?: () => void;
}

export function PdfSidebarView({ url, fileName, subtitle, onBack, onClose }: PdfSidebarViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onBack}
            title="Torna ai dettagli"
            aria-label="Torna ai dettagli"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{fileName}</h2>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </div>
        {onClose ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            title="Chiudi sidebar"
            aria-label="Chiudi sidebar"
            className="shrink-0"
          >
            <PanelRightClose />
          </Button>
        ) : null}
      </div>
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <PdfViewer url={url} fileName={fileName} />
        </Suspense>
      </div>
    </div>
  );
}
