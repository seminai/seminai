import { useState, useCallback, useRef, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { UploadDropzone } from '@/components/molecules/upload-dropzone';
import { UploadFileItem } from '@/components/molecules/upload-file-item';
import { MAX_FILE_SIZE_BYTES } from '@/config/upload-options';
import type { PlanningImportFileMode } from '@/types/planning-import';

interface SelectedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly oversized: boolean;
}

interface ImportFilePanelProps {
  readonly mode: PlanningImportFileMode;
  readonly isPending: boolean;
  readonly progress: number;
  readonly onSubmit: (files: File[]) => void;
  readonly onClose: () => void;
  readonly extraContent?: ReactNode;
}

const LABEL_MAP: Record<PlanningImportFileMode, string> = {
  ddt: 'Carica DDT o fatture (PDF)',
  csv: 'Carica file CSV o Excel',
  brogliaccio: 'Carica brogliaccio (JPG, PNG o WebP)',
};

export function ImportFilePanel({
  mode,
  isPending,
  progress,
  onSubmit,
  onClose,
  extraContent,
}: ImportFilePanelProps) {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const rawFilesRef = useRef<Map<string, File>>(new Map());

  const handleFiles = useCallback((newFiles: File[]) => {
    const mapped: SelectedFile[] = newFiles
      .filter((f) => !rawFilesRef.current.has(f.name))
      .map((f) => {
        const id = `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        rawFilesRef.current.set(id, f);
        return {
          id,
          name: f.name,
          size: f.size,
          oversized: f.size > MAX_FILE_SIZE_BYTES,
        };
      });
    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const removeFile = useCallback((id: string) => {
    rawFilesRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  function handleSubmit() {
    const validFiles: File[] = [];
    for (const f of files) {
      if (f.oversized) continue;
      const raw = rawFilesRef.current.get(f.id);
      if (raw) validFiles.push(raw);
    }
    if (validFiles.length === 0) return;
    onSubmit(validFiles);
  }

  const validCount = files.filter((f) => !f.oversized).length;

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{LABEL_MAP[mode]}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={isPending}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!isPending && <UploadDropzone onFiles={handleFiles} />}
      {!isPending && extraContent && <div className="mt-3">{extraContent}</div>}

      {files.length > 0 && !isPending && (
        <div className="mt-3 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {files.map((f) => (
            <UploadFileItem
              key={f.id}
              name={f.name}
              size={f.size}
              oversized={f.oversized}
              onRemove={() => removeFile(f.id)}
            />
          ))}
        </div>
      )}

      {isPending && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Elaborazione in corso... {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {!isPending && validCount > 0 && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleSubmit}>
            Importa {validCount} {validCount === 1 ? 'file' : 'file'}
          </Button>
        </div>
      )}
    </div>
  );
}
