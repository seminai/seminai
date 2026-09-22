import { useState, useCallback, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { FileText } from 'lucide-react';
import { PdfViewerToolbar } from './pdf-viewer-toolbar';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  readonly url?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
}

export function PdfViewer({ url, fileName, mimeType }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [viewerMode, setViewerMode] = useState<'react-pdf' | 'iframe'>('react-pdf');
  const [showAllPages, setShowAllPages] = useState(false);
  const isCrossOriginUrl = useMemo(() => {
    if (!url || typeof window === 'undefined') return false;
    try {
      return new URL(url).origin !== window.location.origin;
    } catch {
      return false;
    }
  }, [url]);
  const fileKind = useMemo(() => detectFileKind(url, fileName, mimeType), [url, fileName, mimeType]);
  const isExcelFile = fileKind === 'excel';
  const isImageFile = fileKind === 'image';
  const isPdfFile = fileKind === 'pdf';
  const isPageNavigationEnabled = isPdfFile && !isExcelFile && !isImageFile;
  const officeViewerUrl = useMemo(() => {
    if (!url || !isExcelFile) return '';
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }, [url, isExcelFile]);

  useEffect(() => {
    if (isExcelFile || isImageFile) {
      setViewerMode('iframe');
      setPageNumber(1);
      setShowAllPages(false);
      return;
    }
    setViewerMode(isCrossOriginUrl ? 'iframe' : 'react-pdf');
    setPageNumber(1);
    setShowAllPages(false);
  }, [isCrossOriginUrl, isExcelFile, isImageFile, url]);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setViewerMode('iframe');
  }, []);

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 2.0));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.3));
  const prevPage = () => setPageNumber((p) => Math.max(p - 1, 1));
  const nextPage = () =>
    setPageNumber((p) => {
      if (viewerMode === 'iframe') return p + 1;
      if (numPages <= 0) return p;
      return Math.min(p + 1, numPages);
    });
  const toggleAllPages = () => {
    if (!isPageNavigationEnabled || viewerMode !== 'react-pdf') return;
    setShowAllPages((previous) => !previous);
  };
  const jumpToPage = () => {
    if (!isPageNavigationEnabled) return;
    const maxPage = viewerMode === 'react-pdf' && numPages > 0 ? numPages : undefined;
    const promptMessage = maxPage
      ? `Vai alla pagina (1-${maxPage})`
      : 'Vai alla pagina (numero positivo)';
    const rawInput = window.prompt(promptMessage, String(pageNumber));
    if (!rawInput) return;
    const parsedPage = Number(rawInput);
    if (!Number.isFinite(parsedPage)) return;
    const normalizedPage = Math.max(1, Math.floor(parsedPage));
    if (typeof maxPage === 'number') {
      setPageNumber(Math.min(normalizedPage, maxPage));
      return;
    }
    setPageNumber(normalizedPage);
  };
  const toggleBrowserMode = () => {
    if (!isPageNavigationEnabled) return;
    setViewerMode((mode) => (mode === 'react-pdf' ? 'iframe' : 'react-pdf'));
    setShowAllPages(false);
  };
  const resetView = () => {
    setScale(0.8);
    setPageNumber(1);
    setShowAllPages(false);
  };
  const handleDownload = () => {
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName ?? 'document';
    anchor.rel = 'noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };
  const handlePrint = () => {
    if (!url) return;
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    printWindow?.focus();
  };
  const iframeUrl = useMemo(() => {
    if (!url) return '';
    const zoomPercent = Math.max(30, Math.min(200, Math.round(scale * 100)));
    return withPdfViewerFragment(url, pageNumber, zoomPercent);
  }, [url, pageNumber, scale]);

  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 text-muted-foreground">
        <FileText className="h-16 w-16" />
        <p className="text-sm">Anteprima non disponibile</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PdfViewerToolbar
        url={url}
        scale={scale}
        pageNumber={pageNumber}
        numPages={numPages}
        viewerMode={viewerMode}
        showAllPages={showAllPages}
        isExcelFile={isExcelFile}
        isImageFile={isImageFile}
        isPageNavigationEnabled={isPageNavigationEnabled}
        onToggleAllPages={toggleAllPages}
        onJumpToPage={jumpToPage}
        onToggleBrowserMode={toggleBrowserMode}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onPreviousPage={prevPage}
        onNextPage={nextPage}
        onReset={resetView}
        onDownload={handleDownload}
        onPrint={handlePrint}
      />

      <div className="flex-1 overflow-auto bg-muted/20 p-2 md:p-4">
        {isPdfFile && viewerMode === 'react-pdf' ? (
          <div className="flex justify-center">
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={<LoadingPlaceholder />}
            >
              {showAllPages && numPages > 1 ? (
                <div className="flex flex-col gap-4">
                  {Array.from({ length: numPages }, (_, index) => (
                    <Page key={`page-${index + 1}`} pageNumber={index + 1} scale={scale} />
                  ))}
                </div>
              ) : (
                <Page pageNumber={pageNumber} scale={scale} />
              )}
            </Document>
          </div>
        ) : isExcelFile ? (
          <div className="h-full min-h-[60vh] rounded-md border bg-background md:min-h-128">
            <iframe
              src={officeViewerUrl}
              title="Excel preview"
              className="h-full min-h-[60vh] w-full rounded-md md:min-h-128"
              loading="lazy"
            />
            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
              Se il browser blocca l'anteprima, apri il file in una nuova scheda.
            </div>
          </div>
        ) : isImageFile ? (
          <div className="flex min-h-[60vh] justify-center rounded-md border bg-background p-3 md:min-h-128">
            <img
              src={url}
              alt={fileName ?? 'Image preview'}
              className="block h-auto rounded-md"
              style={{
                width: `${Math.round((scale / 0.8) * 100)}%`,
                maxWidth: 'none',
              }}
            />
          </div>
        ) : (
          <div className="h-full min-h-[60vh] rounded-md border bg-background md:min-h-128">
            <iframe
              key={`file-${Math.round(scale * 100)}`}
              src={isPdfFile ? iframeUrl : url}
              title="File preview"
              className="h-full min-h-[60vh] w-full rounded-md md:min-h-128"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </div>
  );
}

type FileKind = 'pdf' | 'excel' | 'image' | 'unknown';

function detectFileKind(url?: string, fileName?: string, mimeType?: string): FileKind {
  const normalizedMimeType = mimeType?.toLowerCase() ?? '';
  if (normalizedMimeType.startsWith('image/')) {
    return 'image';
  }
  if (normalizedMimeType === 'application/pdf') {
    return 'pdf';
  }
  if (
    normalizedMimeType.includes('spreadsheet')
    || normalizedMimeType.includes('excel')
    || normalizedMimeType === 'text/csv'
  ) {
    return 'excel';
  }

  const haystack = `${fileName ?? ''} ${url ?? ''}`.toLowerCase();
  if (hasAnyExtension(haystack, ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods', '.csv'])) {
    return 'excel';
  }
  if (hasAnyExtension(haystack, ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tif', '.tiff'])) {
    return 'image';
  }
  if (hasAnyExtension(haystack, ['.pdf'])) {
    return 'pdf';
  }
  return 'unknown';
}

function hasAnyExtension(value: string, extensions: readonly string[]): boolean {
  return extensions.some((ext) => value.includes(ext));
}

function withPdfViewerFragment(url: string, pageNumber: number, zoomPercent: number): string {
  const page = Math.max(1, Math.floor(pageNumber));
  const zoom = Math.max(30, Math.min(200, Math.floor(zoomPercent)));
  const fragment = `page=${page}&zoom=${zoom}`;

  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
    parsed.hash = fragment;
    return parsed.toString();
  } catch {
    const [base] = url.split('#');
    return `${base}#${fragment}`;
  }
}

function LoadingPlaceholder() {
  return (
    <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
      Caricamento documento...
    </div>
  );
}
