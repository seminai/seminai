import type { TabData } from '@/hooks/use-tabs';

interface AgriculturalReviewExtraction {
  readonly id: string;
  readonly category: string;
  readonly fileName: string;
}

export function buildAgriculturalReviewTab(
  extractions: readonly AgriculturalReviewExtraction[],
): TabData | null {
  const extraction = extractions.find((entry) => entry.category === 'agricultural');
  if (!extraction) return null;
  const extension = extraction.fileName.split('.').pop();
  return {
    id: `extraction-${extraction.id}`,
    title: extraction.fileName,
    subtitle: 'Revisione dati agricoli',
    format: extension ? `.${extension}` : '-',
    source: 'archivio',
  };
}
