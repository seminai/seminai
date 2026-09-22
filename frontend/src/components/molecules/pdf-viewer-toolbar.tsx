import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  MoreHorizontal,
  Pen,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface PdfViewerToolbarProps {
  readonly url: string;
  readonly scale: number;
  readonly pageNumber: number;
  readonly numPages: number;
  readonly viewerMode: 'react-pdf' | 'iframe';
  readonly showAllPages: boolean;
  readonly isExcelFile: boolean;
  readonly isImageFile: boolean;
  readonly isPageNavigationEnabled: boolean;
  readonly onToggleAllPages: () => void;
  readonly onJumpToPage: () => void;
  readonly onToggleBrowserMode: () => void;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  readonly onPreviousPage: () => void;
  readonly onNextPage: () => void;
  readonly onReset: () => void;
  readonly onDownload: () => void;
  readonly onPrint: () => void;
}

/** Viewer actions separated from document rendering and state orchestration. */
export function PdfViewerToolbar(props: PdfViewerToolbarProps): React.JSX.Element {
  const {
    url, scale, pageNumber, numPages, viewerMode, showAllPages, isExcelFile, isImageFile,
    isPageNavigationEnabled, onToggleAllPages, onJumpToPage, onToggleBrowserMode, onZoomOut,
    onZoomIn, onPreviousPage, onNextPage, onReset, onDownload, onPrint,
  } = props;
  const hasLastPage = viewerMode === 'react-pdf' && numPages > 0 && pageNumber >= numPages;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-2 py-2 md:flex-nowrap md:justify-between md:px-3 md:py-1.5">
      <div className="order-1 flex w-full items-center gap-1 overflow-x-auto md:w-auto md:overflow-visible">
        <Button variant={showAllPages ? 'secondary' : 'ghost'} size="icon-sm" title="Vista pagine" onClick={onToggleAllPages} disabled={!isPageNavigationEnabled || viewerMode !== 'react-pdf'}>
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Vai a pagina" onClick={onJumpToPage} disabled={!isPageNavigationEnabled}>
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Alterna motore anteprima" onClick={onToggleBrowserMode} disabled={!isPageNavigationEnabled}>
          <Pen className="h-4 w-4" />
        </Button>
        {isExcelFile || isImageFile ? (
          <div className="ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
            {isExcelFile ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {isExcelFile ? 'Excel' : 'Immagine'}
          </div>
        ) : null}
      </div>
      <div className="order-2 flex items-center gap-1 md:order-0">
        <Button variant="ghost" size="icon-sm" onClick={onZoomOut} disabled={isExcelFile}><ZoomOut className="h-4 w-4" /></Button>
        <span className="min-w-12 text-center text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon-sm" onClick={onZoomIn} disabled={isExcelFile}><ZoomIn className="h-4 w-4" /></Button>
      </div>
      <div className="order-3 flex w-full items-center justify-between gap-1 md:w-auto md:justify-start">
        <Button variant="ghost" size="icon-sm" onClick={onPreviousPage} disabled={!isPageNavigationEnabled || pageNumber <= 1}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="truncate text-xs text-muted-foreground">
          {isExcelFile ? 'Anteprima Excel' : isImageFile ? 'Anteprima immagine' : viewerMode === 'iframe' ? `Pagina ${pageNumber} (browser)` : `${pageNumber} di ${numPages || '–'}`}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onNextPage} disabled={!isPageNavigationEnabled || hasLastPage}><ChevronRight className="h-4 w-4" /></Button>
        <a href={url} target="_blank" rel="noreferrer" title="Apri in una nuova scheda" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><ExternalLink className="h-4 w-4" /></a>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" title="Altro" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onReset}>Ripristina vista</DropdownMenuItem>
            <DropdownMenuItem onClick={onDownload}>Scarica file</DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>Apri per stampa</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
