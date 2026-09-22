import { prisma } from '../../../repositories/Prisma';
import { resolveMentionAccessReason } from './mention-access-reason-resolver';
import { MentionResolutionReason } from './mention-context-resolver.part-01-resolve-mention-context-params';
import { summarizeJson } from './mention-context-resolver.part-03-summarize-json';

export async function resolveProduct(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.product.findFirst({
    where: { id, warehouse: { company: { companyUsers: { some: { userId } } } } },
    select: {
      name: true,
      category: true,
      registrationNumber: true,
      warehouse: { select: { company: { select: { name: true } } } },
      stocks: {
        select: { quantity: true, unitOfMeasureQuantity: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
  if (!row)
    return {
      block: null,
      reason: await resolveMentionAccessReason({ type: 'product', id, userId }),
    };
  const totalStock = row.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const unit = row.stocks[0]?.unitOfMeasureQuantity ?? 'N/A';
  return {
    block: `**Prodotto: ${row.name}**\nCategoria: ${row.category} | Reg: ${row.registrationNumber ?? 'N/A'} | Azienda: ${row.warehouse.company.name} | Giacenza: ${totalStock} ${unit}`,
  };
}

export async function resolveField(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.field.findFirst({
    where: { id, company: { companyUsers: { some: { userId } } } },
    select: {
      name: true,
      sauHa: true,
      city: true,
      foglio: true,
      particella: true,
      company: { select: { name: true } },
      productionUnitsOnFields: {
        select: {
          productionUnit: {
            select: {
              cycles: { select: { cropName: true }, take: 1, orderBy: { seasonYear: 'desc' } },
            },
          },
        },
        take: 3,
      },
    },
  });
  if (!row)
    return { block: null, reason: await resolveMentionAccessReason({ type: 'field', id, userId }) };
  const crops = row.productionUnitsOnFields
    .map((puf) => puf.productionUnit.cycles[0]?.cropName)
    .filter(Boolean)
    .join(', ');
  const catasto = [row.foglio, row.particella].filter(Boolean).join('/');
  return {
    block: `**Campo: ${row.name}**\nAzienda: ${row.company?.name ?? 'N/A'} | SAU: ${row.sauHa ?? 'N/A'} ha | Comune: ${row.city ?? 'N/A'} | Catasto: ${catasto || 'N/A'} | Colture: ${crops || 'N/A'}`,
  };
}

export async function resolveProductionUnit(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.productionUnit.findFirst({
    where: {
      id,
      productionUnitsOnFields: {
        some: { field: { company: { companyUsers: { some: { userId } } } } },
      },
    },
    select: {
      name: true,
      areaHa: true,
      cycles: {
        select: { cropName: true, variety: true },
        take: 1,
        orderBy: { seasonYear: 'desc' },
      },
      productionUnitsOnFields: {
        select: { field: { select: { name: true, company: { select: { name: true } } } } },
        take: 1,
      },
    },
  });
  if (!row)
    return {
      block: null,
      reason: await resolveMentionAccessReason({ type: 'production_unit', id, userId }),
    };
  const cycle = row.cycles[0];
  const fieldInfo = row.productionUnitsOnFields[0]?.field;
  return {
    block: `**Unita' Produttiva: ${row.name}**\nColtura: ${cycle?.cropName ?? 'N/A'} (${cycle?.variety ?? 'N/A'}) | Area: ${row.areaHa} ha | Campo: ${fieldInfo?.name ?? 'N/A'} | Azienda: ${fieldInfo?.company?.name ?? 'N/A'}`,
  };
}

export async function resolveStock(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.stock.findFirst({
    where: { id, product: { warehouse: { company: { companyUsers: { some: { userId } } } } } },
    select: {
      quantity: true,
      unitOfMeasureQuantity: true,
      price: true,
      unitOfMeasurePrice: true,
      companySupplierName: true,
      product: {
        select: { name: true, warehouse: { select: { company: { select: { name: true } } } } },
      },
    },
  });
  if (!row)
    return { block: null, reason: await resolveMentionAccessReason({ type: 'stock', id, userId }) };
  return {
    block: `**Stock: ${row.product.name}**\nQuantita': ${row.quantity} ${row.unitOfMeasureQuantity} | Prezzo: ${row.price} €/${row.unitOfMeasurePrice} | Fornitore: ${row.companySupplierName ?? 'N/A'} | Azienda: ${row.product.warehouse.company.name}`,
  };
}

export async function resolveFile(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.file.findFirst({
    where: { id, company: { companyUsers: { some: { userId } } } },
    select: {
      name: true,
      url: true,
      type: true,
      metadata: true,
      company: { select: { name: true } },
      extractions: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          category: true,
          status: true,
          updatedAt: true,
          extractedData: true,
        },
      },
    },
  });
  if (!row)
    return { block: null, reason: await resolveMentionAccessReason({ type: 'file', id, userId }) };
  let result = `**Documento: ${row.name}**\nTipo: ${row.type ?? 'N/A'} | Azienda: ${row.company.name}\nURL: ${row.url}`;
  const metadataSummary = summarizeJson(row.metadata);
  if (metadataSummary) {
    result += `\nMetadati file: ${metadataSummary}`;
  }
  const latestExtraction = row.extractions[0];
  if (latestExtraction?.extractedData) {
    const extractionSummary = summarizeExtractionData(latestExtraction.extractedData);
    result += `\nUltima estrazione salvata (${latestExtraction.category}, ${latestExtraction.status}, ${latestExtraction.updatedAt.toISOString()}):\n${extractionSummary}`;
  } else {
    result +=
      '\nNessun dato estratto salvato per questo documento. Rispondi usando i metadati disponibili senza richiedere upload.';
  }
  return { block: result };
}

export function summarizeExtractionData(extractedData: unknown): string {
  const asRecord =
    extractedData && typeof extractedData === 'object'
      ? (extractedData as Record<string, unknown>)
      : null;
  const entries = Array.isArray(asRecord?.entries)
    ? (asRecord.entries as Array<Record<string, unknown>>)
    : [];
  if (entries.length > 0) {
    const firstEntry = entries[0];
    const supplierName =
      typeof firstEntry.supplierName === 'string' ? firstEntry.supplierName : 'N/A';
    const supplierVat = typeof firstEntry.supplierVat === 'string' ? firstEntry.supplierVat : 'N/A';
    const invoiceNumber =
      typeof firstEntry.invoiceNumber === 'string' ? firstEntry.invoiceNumber : 'N/A';
    const invoiceDate = typeof firstEntry.invoiceDate === 'string' ? firstEntry.invoiceDate : 'N/A';
    const productName = typeof firstEntry.productName === 'string' ? firstEntry.productName : 'N/A';
    return `Fornitore: ${supplierName} (${supplierVat}) | Documento: ${invoiceNumber} | Data: ${invoiceDate} | Prodotto: ${productName}`;
  }
  return summarizeJson(extractedData) ?? 'N/A';
}
