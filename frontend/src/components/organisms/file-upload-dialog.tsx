import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { UploadDropzone } from '@/components/molecules/upload-dropzone';
import { UploadFileItem } from '@/components/molecules/upload-file-item';
import { ClassifyFileItem } from '@/components/molecules/classify-file-item';
import { useCompanyOptions } from '@/hooks/use-company-options';
import { useWorkspace } from '@/hooks/use-workspace';
import { useExtractionsBatchUploadMulti } from '@/hooks/use-extractions';
import { buildExtractionBatches, type ClassifiedFile } from '@/lib/build-extraction-batches';
import { startPreclassification } from '@/lib/start-preclassification';
import { usePreclassification } from '@/hooks/use-preclassification';
import {
  MAX_FILE_SIZE_BYTES,
  CATEGORY_TO_EXTRACTION_MAP,
  DOCUMENT_CATEGORY_TO_SLUG,
  getCategoryOptionsForKind,
} from '@/config/upload-options';
import { capture } from '@/lib/analytics';

interface UploadedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly format: string;
  readonly oversized: boolean;
}

interface Classification {
  azienda: string;
  categoria: string;
}

interface FileUploadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function FileUploadDialog({ open, onOpenChange }: FileUploadDialogProps) {
  const [dialogKey, setDialogKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setDialogKey((k) => k + 1);
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <UploadDialogBody key={dialogKey} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}

function UploadDialogBody({ onClose }: { readonly onClose: () => void }) {
  const { companies } = useCompanyOptions();
  const { activeWorkspaceKind } = useWorkspace();
  const batchUpload = useExtractionsBatchUploadMulti();
  const [step, setStep] = useState<1 | 2>(1);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [globalAzienda, setGlobalAzienda] = useState('');
  const rawFilesRef = useRef<Map<string, File>>(new Map());
  const [preclassId, setPreclassId] = useState<string | null>(null);
  const preclassStartedRef = useRef(false);
  const touchedRef = useRef<Set<string>>(new Set());
  const { suggestions } = usePreclassification(preclassId);

  const handleFiles = useCallback((newFiles: File[]) => {
    const mapped: UploadedFile[] = newFiles.map((f) => {
      const ext = f.name.split('.').pop();
      const id = `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      rawFilesRef.current.set(id, f);
      return { id, name: f.name, size: f.size, format: ext ? `.${ext}` : '-', oversized: f.size > MAX_FILE_SIZE_BYTES };
    });
    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const removeFile = useCallback((id: string) => {
    rawFilesRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setClassifications((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  const validFiles = files.filter((f) => !f.oversized);

  function handleNext() {
    setStep(2);
    if (preclassStartedRef.current) return;
    const entries = validFiles
      .map((f) => ({ id: f.id, raw: rawFilesRef.current.get(f.id) }))
      .filter((e): e is { id: string; raw: File } => Boolean(e.raw));
    if (entries.length === 0) return;
    preclassStartedRef.current = true;
    startPreclassification(
      entries.map((e) => e.raw),
      entries.map((e) => e.id),
    )
      .then((res) => setPreclassId(res.data.preclassId))
      .catch(() => {
        preclassStartedRef.current = false;
      });
  }

  function updateClassification(fileId: string, field: keyof Classification, value: string) {
    touchedRef.current.add(`${fileId}:${field}`);
    setClassifications((prev) => ({
      ...prev,
      [fileId]: { ...{ azienda: '', categoria: '' }, ...prev[fileId], [field]: value },
    }));
  }

  // Pre-fill per-file azienda/categoria from suggestions, never clobbering a manual override.
  useEffect(() => {
    if (suggestions.size === 0) return;
    setClassifications((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of validFiles) {
        const sugg = suggestions.get(f.id);
        if (!sugg || sugg.status !== 'classified') continue;
        const cur = next[f.id] ?? { azienda: '', categoria: '' };
        let { azienda, categoria } = cur;
        if (sugg.companyId && !azienda && !touchedRef.current.has(`${f.id}:azienda`)) {
          azienda = sugg.companyId;
        }
        if (sugg.documentCategory && !categoria && !touchedRef.current.has(`${f.id}:categoria`)) {
          const slug = DOCUMENT_CATEGORY_TO_SLUG[sugg.documentCategory];
          if (slug) categoria = slug;
        }
        if (azienda !== cur.azienda || categoria !== cur.categoria) {
          next[f.id] = { azienda, categoria };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [suggestions, validFiles]);

  const suggestingIds = useMemo(() => {
    const ids = new Set<string>();
    if (!preclassId) return ids;
    for (const f of validFiles) {
      const sugg = suggestions.get(f.id);
      if (!sugg || sugg.status === 'pending') ids.add(f.id);
    }
    return ids;
  }, [preclassId, suggestions, validFiles]);

  const companyKindById = useMemo(
    () => new Map(companies.map((company) => [company.value, company.kind])),
    [companies],
  );

  function resolveCategoryOptions(companyId: string) {
    return getCategoryOptionsForKind(companyKindById.get(companyId), activeWorkspaceKind);
  }

  async function handleSave() {
    const classified: ClassifiedFile[] = validFiles.flatMap((f) => {
      const raw = rawFilesRef.current.get(f.id);
      if (!raw) return [];
      const companyId = classifications[f.id]?.azienda || globalAzienda;
      const category = CATEGORY_TO_EXTRACTION_MAP[classifications[f.id]?.categoria ?? 'auto'] ?? 'auto';
      return companyId ? [{ raw, companyId, category }] : [];
    });
    const batches = buildExtractionBatches(classified);
    if (batches.length === 0) return;
    capture('file_upload_started', { file_count: classified.length, batch_count: batches.length });
    try { await batchUpload.mutateAsync({ batches }); onClose(); } catch { /* error via batchUpload.error */ }
  }

  const canAdvance = validFiles.length > 0;
  const allClassified = validFiles.length > 0 && validFiles.every((f) => {
    const azienda = classifications[f.id]?.azienda || globalAzienda;
    const categoria = classifications[f.id]?.categoria ?? '';
    return Boolean(azienda && categoria);
  });

  return (
    <DialogContent className={step === 1 ? 'sm:max-w-md' : 'sm:max-w-2xl'}>
      {step === 1 ? (
        <>
          <DialogHeader>
            <DialogTitle>Carica file</DialogTitle>
            <DialogDescription>Carica uno o più documenti</DialogDescription>
          </DialogHeader>
          <UploadDropzone onFiles={handleFiles} />
          {files.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold">File selezionati</span>
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {files.map((f) => (
                  <UploadFileItem key={f.id} name={f.name} size={f.size} oversized={f.oversized} onRemove={() => removeFile(f.id)} />
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button disabled={!canAdvance} onClick={handleNext}>Avanti</Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogHeader>
            <DialogTitle>Classifica File</DialogTitle>
            <DialogDescription>Assegna l'azienda e la categoria ai file</DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Azienda di riferimento</label>
            <div className="flex items-center gap-2">
              <SearchableSelect
                className="flex-1"
                value={globalAzienda}
                options={companies}
                placeholder="Scegli azienda"
                searchPlaceholder="Cerca azienda..."
                emptyMessage="Nessuna azienda trovata."
                onChange={(value) => setGlobalAzienda(value ?? '')}
              />
            </div>
          </div>
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {validFiles.map((f) => {
              const selectedCompanyId = classifications[f.id]?.azienda || globalAzienda;
              return (
              <ClassifyFileItem
                key={f.id} name={f.name} format={f.format}
                azienda={selectedCompanyId} categoria={classifications[f.id]?.categoria ?? ''}
                companies={companies}
                categories={resolveCategoryOptions(selectedCompanyId)}
                isSuggesting={suggestingIds.has(f.id)}
                onAziendaChange={(v) => updateClassification(f.id, 'azienda', v ?? '')}
                onCategoriaChange={(v) => updateClassification(f.id, 'categoria', v ?? '')}
              />
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={batchUpload.isPending}>Annulla</Button>
            <Button disabled={!allClassified || batchUpload.isPending} onClick={handleSave}>
              {batchUpload.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Caricamento...</>) : 'Salva'}
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  );
}
