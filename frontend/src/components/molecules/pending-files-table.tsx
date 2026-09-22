import { TruncatedText } from '@/components/atoms/truncated-text';
import { StatusBadge } from '@/components/atoms/status-badge';
import { FileTypeIcon } from '@/components/atoms/file-type-icon';
import type { ExtractionArchiveRow } from '@/types/extraction';

interface PendingFilesTableProps {
  readonly files: readonly ExtractionArchiveRow[];
  readonly onRowClick?: (file: ExtractionArchiveRow) => void;
}

const COLUMNS = [
  { key: 'titolo' as const, label: 'Titolo', width: 'minmax(160px, 1fr)' },
  { key: 'azienda' as const, label: 'Azienda', width: 'minmax(120px, 1fr)' },
  { key: 'tipoDiFile' as const, label: 'Tipo', width: '120px' },
  { key: 'aggiornato' as const, label: 'Aggiornato', width: '130px' },
  { key: 'status' as const, label: 'Status', width: '120px' },
];

const gridCols = `40px ${COLUMNS.map((c) => c.width).join(' ')}`;

export function PendingFilesTable({ files, onRowClick }: PendingFilesTableProps) {
  if (files.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nessun file da confermare
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-md border border-border">
      <div
        className="sticky top-0 z-10 grid bg-muted/70 text-xs font-semibold text-muted-foreground"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="border-b border-r border-border px-2 py-2 text-center">#</div>
        {COLUMNS.map((col) => (
          <div key={col.key} className="h-10 border-b border-r border-border px-3 py-2 last:border-r-0">
            {col.label}
          </div>
        ))}
      </div>
      {files.map((file, index) => (
        <div
          key={file.id}
          className={`grid h-10 max-h-10 cursor-pointer text-sm transition-colors ${
            index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
          } hover:bg-primary/8`}
          style={{ gridTemplateColumns: gridCols }}
          onClick={() => onRowClick?.(file)}
        >
          <div className="flex items-center justify-center border-r border-b border-border text-xs text-muted-foreground select-none">
            {index + 1}
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-r border-border px-3 py-1.5">
            <FileTypeIcon format={file.formato} className="shrink-0" />
            <TruncatedText
              text={file.titolo}
              className="min-w-0 flex-1 font-medium"
              maxWidth="100%"
            />
          </div>
          <div className="min-w-0 overflow-hidden border-b border-r border-border px-3 py-1.5">
            <TruncatedText text={file.azienda} maxWidth="100%" />
          </div>
          <div className="min-w-0 overflow-hidden border-b border-r border-border px-3 py-1.5">
            <TruncatedText text={file.tipoDiFile} maxWidth="100%" />
          </div>
          <div className="min-w-0 overflow-hidden border-b border-r border-border px-3 py-1.5">
            <TruncatedText text={file.aggiornato} maxWidth="100%" />
          </div>
          <div className="flex items-center border-b border-border px-3 py-1.5">
            <StatusBadge status={file.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
