import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import {
  MAX_FILE_SIZE_BYTES,
  CATEGORY_TO_EXTRACTION_MAP,
  LIKELY_PRODUCTION_UNITS_CATEGORIES,
  DOCUMENT_CATEGORY_TO_SLUG,
} from "@/config/upload-options";
import { ClassifyStep, UploadStep, type Classification, type UploadedFile } from './new-files-steps';
import { NewFilesOverlays } from './new-files-overlays';

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

      <NewFilesOverlays
        isCompanySheetOpen={companySheetOpen}
        preview={preview}
        onCompanySheetChange={setCompanySheetOpen}
        onCompanyCreated={setGlobalAzienda}
        onPreviewClose={closePreview}
      />
    </main>
  );
}
