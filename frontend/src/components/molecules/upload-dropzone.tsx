import { useRef, useState, useCallback } from 'react';
import { File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MAX_FILE_SIZE_MB } from '@/config/upload-options';

interface UploadDropzoneProps {
  readonly onFiles: (files: File[]) => void;
}

export function UploadDropzone({ onFiles }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
      )}
    >
      <FileIcon className="h-10 w-10 text-muted-foreground/50" />
      <div className="text-center">
        <p className="text-sm font-medium">Drag and drop your files</p>
        <p className="text-xs text-muted-foreground">
          Max file size: {MAX_FILE_SIZE_MB} MB
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        Scegli file
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
