import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { UploadDropzone } from '@/components/molecules/upload-dropzone';
import { UploadFileItem } from '@/components/molecules/upload-file-item';
import { ClassifyFileItem } from '@/components/molecules/classify-file-item';

export interface UploadedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly format: string;
  readonly oversized: boolean;
}

export interface Classification {
  readonly azienda: string;
  readonly categoria: string;
}

interface UploadStepProps {
  readonly files: readonly UploadedFile[];
  readonly canAdvance: boolean;
  readonly isOptimizing: boolean;
  readonly onFiles: (files: File[]) => void;
  readonly onRemove: (id: string) => void;
  readonly onCancel: () => void;
  readonly onNext: () => void;
}

export function UploadStep(props: UploadStepProps): React.JSX.Element {
  return (
    <>
      <div className="shrink-0 px-6 pt-10">
        <div className="mx-auto max-w-md">
          <h2 className="text-lg font-semibold">Carica file</h2>
          <p className="text-sm text-muted-foreground">Carica uno o più documenti</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        <div className="mx-auto flex max-w-md flex-col gap-5">
          <UploadDropzone onFiles={props.onFiles} />
          {props.isOptimizing ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Ottimizzazione immagini in corso…
            </div>
          ) : null}
          {props.files.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold">File selezionati</span>
              <div className="flex flex-col gap-1.5">
                {props.files.map((file) => (
                  <UploadFileItem key={file.id} name={file.name} size={file.size} oversized={file.oversized} onRemove={() => props.onRemove(file.id)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 border-t bg-background px-6 py-4">
        <div className="mx-auto flex max-w-md justify-end gap-2">
          <Button variant="outline" onClick={props.onCancel}>Annulla</Button>
          <Button disabled={!props.canAdvance} onClick={props.onNext}>Avanti</Button>
        </div>
      </div>
    </>
  );
}

interface ClassifyStepProps {
  readonly validFiles: readonly UploadedFile[];
  readonly classifications: Readonly<Record<string, Classification>>;
  readonly globalAzienda: string;
  readonly allClassified: boolean;
  readonly isUploading: boolean;
  readonly uploadPercent: number | null;
  readonly companies: readonly { readonly value: string; readonly label: string }[];
  readonly suggestingIds: ReadonlySet<string>;
  readonly onGlobalAziendaChange: (value: string | null) => void;
  readonly onUpdateClassification: (fileId: string, field: keyof Classification, value: string) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onPreviewFile: (fileId: string) => void;
  readonly onRemoveFile: (fileId: string) => void;
  readonly onAddCompany: () => void;
}

export function ClassifyStep(props: ClassifyStepProps): React.JSX.Element {
  return (
    <>
      <div className="shrink-0 px-6 pt-10">
        <div className="mx-auto max-w-md">
          <h2 className="text-lg font-semibold">Classifica File</h2>
          <p className="text-sm text-muted-foreground">Assegna azienda e categoria ai documenti.</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        <div className="mx-auto flex max-w-md flex-col gap-5">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Azienda di riferimento per tutti i file</label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchableSelect value={props.globalAzienda} options={props.companies} placeholder="Scegli azienda" searchPlaceholder="Cerca azienda..." emptyMessage="Nessuna azienda trovata." onChange={props.onGlobalAziendaChange} />
              </div>
              <Button type="button" variant="outline" size="icon" onClick={props.onAddCompany} aria-label="Aggiungi nuova azienda" title="Aggiungi nuova azienda"><Plus className="size-4" /></Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {props.validFiles.map((file) => (
              <ClassifyFileItem
                key={file.id}
                name={file.name}
                format={file.format}
                azienda={props.classifications[file.id]?.azienda || props.globalAzienda}
                categoria={props.classifications[file.id]?.categoria ?? ''}
                companies={props.companies}
                isSuggesting={props.suggestingIds.has(file.id)}
                onAziendaChange={(value) => props.onUpdateClassification(file.id, 'azienda', value ?? '')}
                onCategoriaChange={(value) => props.onUpdateClassification(file.id, 'categoria', value ?? '')}
                onPreview={() => props.onPreviewFile(file.id)}
                onRemove={() => props.onRemoveFile(file.id)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t bg-background px-6 py-4">
        <div className="mx-auto flex max-w-md justify-end gap-2">
          <Button variant="outline" onClick={props.onCancel} disabled={props.isUploading}>Annulla</Button>
          <Button disabled={!props.allClassified || props.isUploading} onClick={props.onSave}>
            {props.isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{props.uploadPercent !== null ? `Caricamento ${props.uploadPercent}%` : 'Caricamento...'}</> : 'Salva'}
          </Button>
        </div>
      </div>
    </>
  );
}
