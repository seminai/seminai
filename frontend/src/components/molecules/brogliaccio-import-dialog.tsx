import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { UploadDropzone } from '@/components/molecules/upload-dropzone';
import { UploadFileItem } from '@/components/molecules/upload-file-item';
import { useBrogliaccioExtraction } from '@/hooks/use-brogliacci-extraction';
import {
  mapBrogliaccioToManualRows,
  summarizeBrogliaccioImport,
  type ProductionUnitMatchOption,
} from '@/utils/brogliaccio-adapter';
import type { ManualPlanRow } from '@/types/planning';

const MAX_BROGLIACCIO_FILE_SIZE_BYTES = 50 * 1024 * 1024;

interface BrogliaccioImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImport: (rows: readonly ManualPlanRow[]) => void;
  readonly productionUnitOptions?: readonly ProductionUnitMatchOption[];
}

interface SelectedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly oversized: boolean;
}

export function BrogliaccioImportDialog({
  open,
  onOpenChange,
  onImport,
  productionUnitOptions = [],
}: BrogliaccioImportDialogProps) {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const rawFilesRef = useRef<Map<string, File>>(new Map());
  const extraction = useBrogliaccioExtraction();

  const resetFiles = useCallback(() => {
    setFiles([]);
    rawFilesRef.current.clear();
  }, []);

  useEffect(() => {
    if (!open) resetFiles();
  }, [open, resetFiles]);

  const handleFiles = useCallback((newFiles: File[]) => {
    const mapped = newFiles.map((file) => {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const oversized = file.size > MAX_BROGLIACCIO_FILE_SIZE_BYTES;
      if (!oversized) rawFilesRef.current.set(id, file);
      return { id, name: file.name, size: file.size, oversized };
    });
    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const removeFile = useCallback((id: string) => {
    rawFilesRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  async function handleExtract() {
    const validFiles = Array.from(rawFilesRef.current.values());
    if (validFiles.length === 0) return;

    try {
      const result = await extraction.mutateAsync(validFiles);
      const rows = mapBrogliaccioToManualRows(result, {
        idPrefix: `brog-${Date.now()}`,
        productionUnitOptions,
      });
      const summary = summarizeBrogliaccioImport(result, rows.length);
      if (rows.length === 0) {
        toast.error('Nessuna riga valida estratta dal brogliaccio');
        return;
      }
      onImport(rows);
      toast.success(`Importate ${summary.rowCount} righe da ${summary.extractedFiles} file`);
      if (summary.failedFiles > 0) {
        toast.warning(`File non importati: ${summary.failedFileNames.join(', ')}`);
      }
      onOpenChange(false);
      resetFiles();
    } catch {
      toast.error("Errore durante l'estrazione del brogliaccio");
    }
  }

  const validFileCount = files.filter((file) => !file.oversized).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importa brogliaccio</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <UploadDropzone onFiles={handleFiles} />
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={validFileCount === 0 || extraction.isPending}
            onClick={() => void handleExtract()}
          >
            {extraction.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Estrazione...
              </>
            ) : (
              'Estrai dati'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
