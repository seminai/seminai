import { PrismaClient } from '@prisma/client';

const CATEGORY_LABELS: Record<string, string> = {
  OPERATION: 'Operazione di campo',
  OBSERVATION: 'Osservazione',
  TREATMENT: 'Trattamento',
  PURCHASE: 'Acquisto (carico magazzino)',
  HARVEST: 'Raccolta',
  SALE: 'Vendita (scarico magazzino)',
};

interface SaveToolArgs {
  readonly rawContent?: string;
  readonly category?: string;
  readonly extractedData?: {
    readonly recognizedProducts?: ReadonlyArray<{ name?: string }>;
    readonly recognizedFields?: ReadonlyArray<{ name?: string; fieldId?: string }>;
    readonly operation?: string;
  };
  readonly fieldId?: string;
  readonly productionUnitId?: string;
  readonly operationDate?: string;
  readonly quantity?: number;
  readonly unitOfMeasure?: string;
  readonly unitOfMeasureQuantity?: string;
  readonly productName?: string;
  readonly productId?: string;
  readonly cropName?: string;
}

function formatDateItalian(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Resolves field/productionUnit/company names from database IDs.
 */
async function resolveNames(
  prismaClient: PrismaClient,
  toolCalls: ReadonlyArray<{ args: Record<string, unknown> }>,
) {
  const fieldIds = new Set<string>();
  const puIds = new Set<string>();
  const productIds = new Set<string>();
  for (const tc of toolCalls) {
    const args = tc.args as SaveToolArgs;
    if (args.fieldId) fieldIds.add(args.fieldId);
    if (args.productionUnitId) puIds.add(args.productionUnitId);
    if (args.productId) productIds.add(args.productId);
  }

  const [fields, productionUnits, products] = await Promise.all([
    fieldIds.size > 0
      ? prismaClient.field.findMany({
          where: { id: { in: [...fieldIds] } },
          select: { id: true, name: true, company: { select: { name: true } } },
        })
      : [],
    puIds.size > 0
      ? prismaClient.productionUnit.findMany({
          where: { id: { in: [...puIds] } },
          select: { id: true, name: true, areaHa: true },
        })
      : [],
    productIds.size > 0
      ? prismaClient.product.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const puMap = new Map(productionUnits.map((pu) => [pu.id, pu]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  return { fieldMap, puMap, productMap };
}

/**
 * Builds a human-readable summary resolving IDs to names (no UUIDs shown).
 */
export async function buildHumanReadableSummary(
  prismaClient: PrismaClient,
  pendingToolCalls: ReadonlyArray<{ name: string; args: Record<string, unknown> }>,
): Promise<string> {
  const { fieldMap, puMap, productMap } = await resolveNames(prismaClient, pendingToolCalls);
  const firstArgs = pendingToolCalls[0].args as SaveToolArgs;
  const firstToolName = pendingToolCalls[0].name;

  const category =
    firstToolName === 'save_stock_out_treatment'
      ? 'Trattamento (scarico magazzino)'
      : firstToolName === 'save_stock_in_purchase'
        ? 'Acquisto (carico magazzino)'
        : firstToolName === 'save_stock_out_sale'
          ? 'Vendita (scarico magazzino)'
          : CATEGORY_LABELS[firstArgs.category ?? ''] ?? firstArgs.category ?? 'Nota di campo';
  const operation = firstArgs.extractedData?.operation;
  const operationDate = firstArgs.operationDate
    ? formatDateItalian(firstArgs.operationDate)
    : undefined;

  const pu = firstArgs.productionUnitId ? puMap.get(firstArgs.productionUnitId) : undefined;
  const puLabel = pu ? `${pu.name}${pu.areaHa ? ` (${pu.areaHa} ha)` : ''}` : undefined;

  const companyNames = new Set<string>();
  const fieldNames: string[] = [];
  for (const tc of pendingToolCalls) {
    const args = tc.args as SaveToolArgs;
    const field = args.fieldId ? fieldMap.get(args.fieldId) : undefined;
    if (field) {
      fieldNames.push(field.name);
      if (field.company?.name) companyNames.add(field.company.name);
    } else {
      const recognized = args.extractedData?.recognizedFields?.[0]?.name;
      if (recognized) fieldNames.push(recognized);
    }
  }
  const companyLabel = companyNames.size > 0 ? [...companyNames].join(', ') : undefined;

  const products =
    firstArgs.extractedData?.recognizedProducts?.map((p) => p.name).filter(Boolean) ?? [];
  const productLabel =
    firstArgs.productName ||
    (firstArgs.productId ? productMap.get(firstArgs.productId)?.name : undefined) ||
    (products.length > 0 ? products.join(', ') : undefined);

  const lines: string[] = [];
  lines.push(`📋 Categoria: ${category}${operation ? ` — ${operation}` : ''}`);
  if (companyLabel) lines.push(`🏢 Azienda: ${companyLabel}`);
  if (puLabel) lines.push(`🌱 Unità Produttiva: ${puLabel}`);
  if (operationDate) lines.push(`📅 Data: ${operationDate}`);
  if (firstArgs.rawContent) lines.push(`📝 Contenuto: "${firstArgs.rawContent}"`);
  if (productLabel) lines.push(`💊 Prodotto: ${productLabel}`);
  if (firstArgs.cropName) lines.push(`🌾 Coltura: ${firstArgs.cropName}`);
  if (firstArgs.quantity) {
    lines.push(
      `📊 Quantità: ${firstArgs.quantity} ${firstArgs.unitOfMeasure ?? firstArgs.unitOfMeasureQuantity ?? ''}`,
    );
  }
  if (fieldNames.length > 0) {
    lines.push(`🏭 Campi interessati (${fieldNames.length}):`);
    fieldNames.forEach((n, i) => lines.push(`   ${i + 1}. ${n}`));
  }
  if (pendingToolCalls.length > 1) {
    lines.push(`\n⚠️ Verranno create ${pendingToolCalls.length} registrazioni (una per campo).`);
  }

  return lines.join('\n');
}
