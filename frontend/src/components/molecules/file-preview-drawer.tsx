import { lazy, Suspense } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
const PdfViewer = lazy(() => import('@/components/molecules/pdf-viewer').then((m) => ({ default: m.PdfViewer })));

interface FilePreviewDrawerProps {
  readonly fileName: string | undefined;
  readonly url: string | undefined;
  readonly mimeType: string | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function FilePreviewDrawer({
  fileName,
  url,
  mimeType,
  open,
  onOpenChange,
}: FilePreviewDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{fileName ?? 'Anteprima'}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={null}><PdfViewer url={url} fileName={fileName} mimeType={mimeType} /></Suspense>
        </div>
      </SheetContent>
    </Sheet>
  );
}
