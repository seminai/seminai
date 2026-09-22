import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { usePostProductsBulkFromDdtToProductList } from '@/generated/api/products/products';
import { useBrogliaccioExtraction } from '@/hooks/use-brogliacci-extraction';
import { mapProductToPlanning } from '@/utils/map-product-to-planning';
import {
  mapBrogliaccioToPlanningProducts,
  summarizeBrogliaccioImport,
} from '@/utils/brogliaccio-adapter';
import type { usePlanningState } from '@/hooks/use-planning-state';
import type { OcrProvider } from '@/components/molecules/ocr-provider-selector';
import type { PlanningImportPanel } from '@/types/planning-import';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function readSuggestedProducts(value: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(value) || !isRecord(value.data)) return [];
  const data = value.data;
  if (!isRecord(data.data)) return [];
  const suggestedProducts = data.data.suggestedProducts;
  return Array.isArray(suggestedProducts) ? suggestedProducts : [];
}

export function useAutoPlanningImports({
  planning,
}: {
  readonly planning: ReturnType<typeof usePlanningState>;
}) {
  const ddtImport = usePostProductsBulkFromDdtToProductList();
  const brogliaccioExtraction = useBrogliaccioExtraction();
  const [activePanel, setActivePanel] = useState<PlanningImportPanel>(null);
  const [ocrProvider, setOcrProvider] = useState<OcrProvider>('mistral');
  const [importProgress, setImportProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProgressSimulation = useCallback(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setImportProgress(100);
    setTimeout(() => {
      setImportProgress(0);
      setActivePanel(null);
    }, 500);
  }, []);

  const startProgressSimulation = useCallback(() => {
    setImportProgress(5);
    progressTimerRef.current = setInterval(() => {
      setImportProgress((prev) => {
        if (prev >= 90) {
          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
          return prev;
        }
        return prev + Math.random() * 8;
      });
    }, 600);
  }, []);

  useEffect(() => () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  }, []);

  useEffect(() => {
    if (activePanel !== 'ddt') setOcrProvider('mistral');
  }, [activePanel]);

  const handleDdtSubmit = useCallback(async (files: File[]) => {
    startProgressSimulation();
    try {
      const result = await ddtImport.mutateAsync({ data: { files, ocrProvider } });
      planning.addAutoProducts(readSuggestedProducts(result).map(mapProductToPlanning));
    } finally {
      stopProgressSimulation();
    }
  }, [ddtImport, ocrProvider, planning, startProgressSimulation, stopProgressSimulation]);

  const handleCsvSubmit = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    startProgressSimulation();
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map((header) => header.trim());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(',').map((value) => value.trim());
        const record: Record<string, unknown> = {};
        headers.forEach((header, index) => { record[header] = values[index] ?? ''; });
        return mapProductToPlanning(record);
      });
      planning.addAutoProducts(rows);
    } finally {
      stopProgressSimulation();
    }
  }, [planning, startProgressSimulation, stopProgressSimulation]);

  const handleBrogliaccioSubmit = useCallback(async (files: File[]) => {
    startProgressSimulation();
    try {
      const result = await brogliaccioExtraction.mutateAsync(files);
      const products = mapBrogliaccioToPlanningProducts(result);
      const summary = summarizeBrogliaccioImport(result, products.length);
      if (products.length === 0) {
        toast.error('Nessun prodotto valido estratto dal brogliaccio');
        return;
      }
      planning.addAutoProducts(products);
      toast.success(`Importati ${summary.rowCount} prodotti da brogliaccio`);
    } finally {
      stopProgressSimulation();
    }
  }, [brogliaccioExtraction, planning, startProgressSimulation, stopProgressSimulation]);

  const handlePanelSubmit = useCallback((files: File[]) => {
    if (activePanel === 'ddt') void handleDdtSubmit(files);
    if (activePanel === 'csv') void handleCsvSubmit(files);
    if (activePanel === 'brogliaccio') void handleBrogliaccioSubmit(files);
  }, [activePanel, handleBrogliaccioSubmit, handleCsvSubmit, handleDdtSubmit]);

  return {
    activePanel,
    setActivePanel,
    ocrProvider,
    setOcrProvider,
    importProgress,
    isPanelPending:
      (activePanel === 'ddt' && ddtImport.isPending) ||
      (activePanel === 'brogliaccio' && brogliaccioExtraction.isPending),
    handlePanelSubmit,
  } as const;
}
