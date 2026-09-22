import { ClipboardCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PendingFilesTable } from '@/components/molecules/pending-files-table';
import type { ExtractionArchiveRow } from '@/types/extraction';

interface PendingFilesSectionProps {
  readonly files: readonly ExtractionArchiveRow[];
  readonly onFileClick?: (file: ExtractionArchiveRow) => void;
}

export function PendingFilesSection({ files, onFileClick }: PendingFilesSectionProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          File da confermare
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({files.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-72 overflow-y-auto">
        <PendingFilesTable files={files} onRowClick={onFileClick} />
      </CardContent>
    </Card>
  );
}
