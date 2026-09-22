import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/molecules/searchable-select";
import { UploadDropzone } from "@/components/molecules/upload-dropzone";
import { UploadFileItem } from "@/components/molecules/upload-file-item";
import { ClassifyFileItem } from "@/components/molecules/classify-file-item";
import { FilePreviewDrawer } from "@/components/molecules/file-preview-drawer";
import { CompanyFormSheet } from "@/components/organisms/company/company-form-sheet";
import { useNavigate } from "@tanstack/react-router";
import { useTabs } from "@/hooks/use-tabs";
import { useCompanyOptions } from "@/hooks/use-company-options";
import { useExtractionsBatchUploadMulti } from "@/hooks/use-extractions";
import {
  buildExtractionBatches,
  type ClassifiedFile,
} from "@/lib/build-extraction-batches";
import { compressImages } from "@/lib/compress-image";
import { startPreclassification } from "@/lib/start-preclassification";
import { buildAgriculturalReviewTab } from "@/lib/agricultural-review-tab";
import { usePreclassification } from "@/hooks/use-preclassification";
// import { formatBytes } from "@/lib/format-bytes";
import {
  MAX_FILE_SIZE_BYTES,
  CATEGORY_TO_EXTRACTION_MAP,
  LIKELY_PRODUCTION_UNITS_CATEGORIES,
  DOCUMENT_CATEGORY_TO_SLUG,
} from "@/config/upload-options";

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

export function NewFilesLayout() {
  const { addTab, removeTab } = useTabs();
  const navigate = useNavigate();
  const { companies } = useCompanyOptions();
  const batchUpload = useExtractionsBatchUploadMulti();
  const [step, setStep] = useState<1 | 2>(1);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [classifications, setClassifications] = useState<
    Record<string, Classification>
  >({});
  const [globalAzienda, setGlobalAzienda] = useState("");
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    url: string;
    mimeType: string;
  } | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [bytesSaved, setBytesSaved] = useState(0);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const rawFilesRef = useRef<Map<string, File>>(new Map());
  const [preclassId, setPreclassId] = useState<string | null>(null);
  const preclassStartedRef = useRef(false);
  const touchedRef = useRef<Set<string>>(new Set());
  const { suggestions } = usePreclassification(preclassId);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    setIsOptimizing(true);
    try {
      const results = await compressImages(newFiles);
      const savedNow = results.reduce(
        (acc, r) => acc + (r.originalSize - r.compressedSize),
        0,
      );
      const mapped: UploadedFile[] = results.map((res) => {
        const file = res.file;
        const ext = file.name.split(".").pop();
        const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        rawFilesRef.current.set(id, file);
        return {
          id,
          name: file.name,
          size: file.size,
          format: ext ? `.${ext}` : "-",
          oversized: file.size > MAX_FILE_SIZE_BYTES,
        };
      });
      setFiles((prev) => [...prev, ...mapped]);
      setBytesSaved((prev) => prev + savedNow);
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    rawFilesRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setClassifications((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)),
    );
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

  // Pre-fill per-file azienda/categoria from suggestions, never clobbering a manual override.
  useEffect(() => {
    if (suggestions.size === 0) return;
    setClassifications((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of validFiles) {
        const sugg = suggestions.get(f.id);
        if (!sugg || sugg.status !== "classified") continue;
        const cur = next[f.id] ?? { azienda: "", categoria: "" };
        let { azienda, categoria } = cur;
        if (sugg.companyId && !azienda && !touchedRef.current.has(`${f.id}:azienda`)) {
          azienda = sugg.companyId;
        }
        if (
          sugg.documentCategory &&
          !categoria &&
          !touchedRef.current.has(`${f.id}:categoria`)
        ) {
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
      if (!sugg || sugg.status === "pending") ids.add(f.id);
    }
    return ids;
  }, [preclassId, suggestions, validFiles]);

  function updateClassification(
    fileId: string,
    field: keyof Classification,
    value: string,
  ) {
    touchedRef.current.add(`${fileId}:${field}`);
    setClassifications((prev) => ({
      ...prev,
      [fileId]: {
        ...{ azienda: "", categoria: "" },
        ...prev[fileId],
        [field]: value,
      },
    }));
  }

  function handleCancel() {
    void navigate({ to: "/add-data", search: {} });
  }

  async function handleSave() {
    const classified: ClassifiedFile[] = validFiles.flatMap((f) => {
      const raw = rawFilesRef.current.get(f.id);
      if (!raw) return [];
      const companyId = classifications[f.id]?.azienda || globalAzienda;
      const category =
        CATEGORY_TO_EXTRACTION_MAP[
          classifications[f.id]?.categoria ?? "auto"
        ] ?? "auto";
      return companyId ? [{ raw, companyId, category }] : [];
    });
    const batches = buildExtractionBatches(classified);
    if (batches.length === 0) return;

    const userCategories = validFiles
      .map((f) => classifications[f.id]?.categoria)
      .filter((entry): entry is string => Boolean(entry));
    const uniqueCompanies = new Set(classified.map((entry) => entry.companyId));
    const allProductionUnits =
      userCategories.length === validFiles.length &&
      userCategories.length > 0 &&
      userCategories.every((cat) => LIKELY_PRODUCTION_UNITS_CATEGORIES.includes(cat));
    const shouldRouteToProductionUnitsWizard =
      allProductionUnits && uniqueCompanies.size === 1;

    setUploadPercent(0);
    try {
      const result = await batchUpload.mutateAsync({
        batches,
        onUploadProgress: setUploadPercent,
      });
      await removeTab("add-data");

      const agriculturalReviewTab = buildAgriculturalReviewTab(
        result.succeeded.flatMap((entry) => entry.data.extractions),
      );
      if (agriculturalReviewTab) {
        addTab(agriculturalReviewTab);
        return;
      }

      if (shouldRouteToProductionUnitsWizard) {
        const extractionIds = result.succeeded.flatMap((entry) =>
          entry.data.extractions.map((extraction) => extraction.id),
        );
        const prefillCompanyId = [...uniqueCompanies][0];
        if (extractionIds.length > 0 && prefillCompanyId) {
          void navigate({
            to: "/add-data",
            search: {
              type: "manual",
              entity: "production-units",
              extractionIds: extractionIds.join(","),
              prefillCompanyId,
            },
          });
          return;
        }
      }

      void navigate({ to: "/archivio", search: {} });
    } catch {
      /* handled via batchUpload.error */
    } finally {
      setUploadPercent(null);
    }
  }

  const canAdvance = validFiles.length > 0 && !isOptimizing;
  const allClassified =
    validFiles.length > 0 &&
    validFiles.every((f) => {
      const azienda = classifications[f.id]?.azienda || globalAzienda;
      return Boolean(azienda && classifications[f.id]?.categoria);
    });

  const openPreview = useCallback((fileId: string) => {
    const raw = rawFilesRef.current.get(fileId);
    if (!raw) return;
    setPreview({
      name: raw.name,
      url: URL.createObjectURL(raw),
      mimeType: raw.type,
    });
  }, []);

  const closePreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {step === 1 ? (
        <UploadStep
          files={files}
          canAdvance={canAdvance}
          isOptimizing={isOptimizing}
          bytesSaved={bytesSaved}
          onFiles={handleFiles}
          onRemove={removeFile}
          onCancel={handleCancel}
          onNext={handleNext}
        />
      ) : (
        <ClassifyStep
          validFiles={validFiles}
          classifications={classifications}
          globalAzienda={globalAzienda}
          allClassified={allClassified}
          isUploading={batchUpload.isPending}
          uploadPercent={uploadPercent}
          companies={companies}
          suggestingIds={suggestingIds}
          onGlobalAziendaChange={(v) => setGlobalAzienda(v ?? "")}
          onUpdateClassification={updateClassification}
          onCancel={handleCancel}
          onSave={handleSave}
          onPreviewFile={openPreview}
          onRemoveFile={removeFile}
          onAddCompany={() => setCompanySheetOpen(true)}
        />
      )}

      <CompanyFormSheet
        open={companySheetOpen}
        onOpenChange={setCompanySheetOpen}
        onCreated={(newCompanyId) => setGlobalAzienda(newCompanyId)}
      />

      <FilePreviewDrawer
        fileName={preview?.name}
        url={preview?.url}
        mimeType={preview?.mimeType}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      />
    </main>
  );
}

interface UploadStepProps {
  readonly files: readonly UploadedFile[];
  readonly canAdvance: boolean;
  readonly isOptimizing: boolean;
  readonly bytesSaved?: number | null;
  readonly onFiles: (files: File[]) => void;
  readonly onRemove: (id: string) => void;
  readonly onCancel: () => void;
  readonly onNext: () => void;
}

function UploadStep({
  files,
  canAdvance,
  isOptimizing,
  bytesSaved = null,
  onFiles,
  onRemove,
  onCancel,
  onNext,
}: UploadStepProps) {
  console.log("bytesSaved", bytesSaved);
  return (
    <>
      <div className="shrink-0 px-6 pt-10">
        <div className="mx-auto max-w-md">
          <h2 className="text-lg font-semibold">Carica file</h2>
          <p className="text-sm text-muted-foreground">
            Carica uno o più documenti
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        <div className="mx-auto flex max-w-md flex-col gap-5">
          <UploadDropzone onFiles={onFiles} />
          {isOptimizing && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Ottimizzazione immagini in corso…
            </div>
          )}
          {/* {!isOptimizing && bytesSaved > 0 && (
            <div className="rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              Risparmiati {formatBytes(bytesSaved)} grazie all'ottimizzazione
              automatica.
            </div>
          )} */}
          {files.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold">File selezionati</span>
              <div className="flex flex-col gap-1.5">
                {files.map((f) => (
                  <UploadFileItem
                    key={f.id}
                    name={f.name}
                    size={f.size}
                    oversized={f.oversized}
                    onRemove={() => onRemove(f.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t bg-background px-6 py-4">
        <div className="mx-auto flex max-w-md justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Annulla
          </Button>
          <Button disabled={!canAdvance} onClick={onNext}>
            Avanti
          </Button>
        </div>
      </div>
    </>
  );
}

interface ClassifyStepProps {
  readonly validFiles: readonly UploadedFile[];
  readonly classifications: Record<string, Classification>;
  readonly globalAzienda: string;
  readonly allClassified: boolean;
  readonly isUploading: boolean;
  readonly uploadPercent: number | null;
  readonly companies: readonly { value: string; label: string }[];
  readonly suggestingIds: ReadonlySet<string>;
  readonly onGlobalAziendaChange: (value: string | null) => void;
  readonly onUpdateClassification: (
    fileId: string,
    field: keyof Classification,
    value: string,
  ) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onPreviewFile: (fileId: string) => void;
  readonly onRemoveFile: (fileId: string) => void;
  readonly onAddCompany: () => void;
}

function ClassifyStep({
  validFiles,
  classifications,
  globalAzienda,
  allClassified,
  isUploading,
  uploadPercent,
  companies,
  suggestingIds,
  onGlobalAziendaChange,
  onUpdateClassification,
  onCancel,
  onSave,
  onPreviewFile,
  onRemoveFile,
  onAddCompany,
}: ClassifyStepProps) {
  return (
    <>
      <div className="shrink-0 px-6 pt-10">
        <div className="mx-auto max-w-md">
          <h2 className="text-lg font-semibold">Classifica File</h2>
          <p className="text-sm text-muted-foreground">
            Assegna l'azienda e la categoria ai file che stai caricando per una
            migliore classificazione
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        <div className="mx-auto flex max-w-md flex-col gap-5">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Azienda di riferimento per tutti i file
            </label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  value={globalAzienda}
                  options={companies}
                  placeholder="Scegli azienda a cui fanno riferimento i documenti"
                  searchPlaceholder="Cerca azienda..."
                  emptyMessage="Nessuna azienda trovata."
                  onChange={onGlobalAziendaChange}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onAddCompany}
                aria-label="Aggiungi nuova azienda"
                title="Aggiungi nuova azienda"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {validFiles.map((f) => (
              <ClassifyFileItem
                key={f.id}
                name={f.name}
                format={f.format}
                azienda={classifications[f.id]?.azienda || globalAzienda}
                categoria={classifications[f.id]?.categoria ?? ""}
                companies={companies}
                isSuggesting={suggestingIds.has(f.id)}
                onAziendaChange={(v) =>
                  onUpdateClassification(f.id, "azienda", v ?? "")
                }
                onCategoriaChange={(v) =>
                  onUpdateClassification(f.id, "categoria", v ?? "")
                }
                onPreview={() => onPreviewFile(f.id)}
                onRemove={() => onRemoveFile(f.id)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t bg-background px-6 py-4">
        <div className="mx-auto flex max-w-md justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isUploading}>
            Annulla
          </Button>
          <Button disabled={!allClassified || isUploading} onClick={onSave}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploadPercent !== null
                  ? `Caricamento ${uploadPercent}%`
                  : "Caricamento..."}
              </>
            ) : (
              "Salva"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
