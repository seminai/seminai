import type { StockRow } from '@/components/molecules/stock-movements-table';

const DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveSourcePdf(s: Record<string, unknown>): { url: string | null; fileName: string | null } {
  const sourceFile = asRecord(s.sourceFile);
  const sourceFileUrl = asString(sourceFile?.url);
  if (sourceFileUrl) {
    return { url: sourceFileUrl, fileName: asString(sourceFile?.name) ?? deriveFileName(sourceFileUrl) };
  }
  const ddtUrl = asString(s.ddtUrlFile);
  if (ddtUrl) {
    const ddtCode = asString(s.ddtCode);
    return { url: ddtUrl, fileName: ddtCode ? `DDT ${ddtCode}` : deriveFileName(ddtUrl) };
  }
  const invoiceUrl = asString(s.invoiceUrlFile);
  if (invoiceUrl) {
    const invoiceCode = asString(s.invoiceCode);
    return { url: invoiceUrl, fileName: invoiceCode ? `Fattura ${invoiceCode}` : deriveFileName(invoiceUrl) };
  }
  return { url: null, fileName: null };
}

function deriveFileName(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'documento.pdf';
  } catch {
    return 'documento.pdf';
  }
}

function toIsoDate(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return DATE_FORMATTER.format(date);
}

export function extractStocks(raw: unknown): StockRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: Record<string, unknown>, i: number) => {
    const dateRaw = toIsoDate(s.ddtDate ?? s.date);
    const { url, fileName } = resolveSourcePdf(s);
    return {
      id: String(s.id ?? i),
      quantity: Number(s.quantity ?? 0),
      unitOfMeasure: String(s.unitOfMeasureQuantity ?? s.unitOfMeasure ?? '-'),
      type: String(s.type ?? 'IN'),
      ddtCode: String(s.ddtCode ?? '-'),
      dateRaw,
      date: formatDate(dateRaw),
      supplier: String(s.companySupplierName ?? s.supplier ?? '-'),
      price: Number(s.price ?? 0),
      unitOfMeasurePrice: String(s.unitOfMeasurePrice ?? '€'),
      sourcePdfUrl: url,
      sourcePdfFileName: fileName,
    };
  });
}
