import { SpinningLogo } from '@/components/atoms/spinning-logo';
import type { ExtractionArchiveRow } from '@/types/extraction';
import type { ExtractionProgressState } from '@/hooks/use-extraction-progress';

interface LoadingFilesListProps {
  readonly files: readonly ExtractionArchiveRow[];
  readonly getProgress?: (extractionId: string) => ExtractionProgressState | undefined;
  readonly onFileClick?: (file: ExtractionArchiveRow) => void;
}

export function LoadingFilesList({ files, getProgress, onFileClick }: LoadingFilesListProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
      {files.map((file) => {
        const live = getProgress?.(file.extractionId);
        const progress = live?.progress ?? file.progress;
        return (
          <button
            key={file.id}
            type="button"
            className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-100"
            onClick={() => onFileClick?.(file)}
          >
            <SpinningLogo size={18} />
            <div className="min-w-0 flex-1">
              <span className="truncate font-medium">{file.titolo}</span>
              <span className="ml-2 text-xs text-muted-foreground">{file.azienda}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-1.5 w-16 rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{progress}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
