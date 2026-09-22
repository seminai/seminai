import { useRef } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';

interface VisuraCameraleUploaderProps {
  readonly disabled?: boolean;
  readonly isExtracting: boolean;
  readonly onFile: (file: File) => void;
}

export function VisuraCameraleUploader({
  disabled = false,
  isExtracting,
  onFile,
}: VisuraCameraleUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || isExtracting;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 rounded-md border border-dashed bg-muted/40 px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
        title="Carica una visura camerale PDF per compilare il form automaticamente"
      >
        {isExtracting ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileUp className="size-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {isExtracting ? 'Estrazione in corso...' : 'Carica visura camerale (PDF)'}
            {!isExtracting && <Sparkles className="size-3.5 text-muted-foreground" />}
          </p>
          <p className="text-xs text-muted-foreground">
            {isExtracting
              ? 'Sto leggendo il documento e compilando i campi.'
              : 'Compileremo il form automaticamente. Potrai modificare i dati prima di salvare.'}
          </p>
        </div>
      </button>
    </>
  );
}
