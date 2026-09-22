import { hasChatLlmApiKey } from '../llm-config';
import { buildImageContentPart, fetchVisionCompletion } from '../llm-vision-client';

export interface BrogliaccioRawEntry {
  date: string;
  productionUnitName: string | null;
  areaHa: number | null;
  productName: string;
  quantity: number;
  unitOfMeasure: string;
  waterQuantityL: number | null;
}

export interface BrogliaccioJobPayload {
  productionUnitName: string | null;
  dateOfOpeation: string;
  category: 'TREATMENT';
  quantity: number;
  unitOfMeasureQuantity: string;
  treatedSurface: number | null;
  totalDistributedWaterL: number | null;
  stocks: Array<{
    product: {
      name: string;
      category: 'PESTICIDE';
      type: 'Fitosanitario';
      registrationNumber: string | null;
    };
    quantity: number;
    unitOfMeasureQuantity: string;
    type: 'OUT';
  }>;
}

export interface BrogliaccioExtractionResult {
  rawEntries: BrogliaccioRawEntry[];
  payload: BrogliaccioJobPayload[];
}

const EXTRACTION_PROMPT = `Sei un esperto agronomo che legge brogliacci (registri cartacei manoscritti) di trattamenti fitosanitari italiani.

Analizza l'immagine del brogliaccio e estrai OGNI riga di trattamento come un oggetto JSON.

REGOLE DI ESTRAZIONE:
1. **Date**: Formato DD/MM/YY o DD-MM. Estrai esattamente come scritto (es. "10/6/25", "15-6").
2. **Unità produttive**: Se il brogliaccio ha colonne separate per diverse unità produttive (es. "Divetti 3HA", "Gavioli 1/2 HA"), crea un entry separato per OGNI unità produttiva per OGNI data. Il nome dell'unità produttiva è l'intestazione della colonna.
3. **Superficie**: Estrai gli ettari dall'intestazione (es. "3HA" → 3, "1/2 HA" → 0.5, "ETTARI 6.65" → 6.65). Se c'è un'unica superficie in testa al documento, usa quella per tutti.
4. **Prodotti**: Nome commerciale del prodotto fitosanitario (es. FOLPEC, FORTUNE, SACRON, DELAN SC, AIRONE, MOVENTO, EPIK SL, BORDOFLOW, ENVITA, etc.)
5. **Quantità**: Numero con decimali. Converti la virgola decimale italiana in punto (es. "0,81" → 0.81, "4,5" → 4.5).
6. **Unità di misura**: "kg", "L" (litri). Nota: "Ky" o "ky" = kg, "l" o "lt" = L.
7. **Acqua**: Se indicata la quantità d'acqua (es. "ql.20" = 20 quintali = 2000 litri, "ql 46" = 4600 litri), estraila in litri.
8. **"X" o trattino**: Significa che quel trattamento NON è stato fatto per quella unità produttiva. NON creare un entry.
9. Se NON ci sono colonne per unità produttive, usa null per productionUnitName.

FORMATO OUTPUT - oggetto JSON con chiave "entries":
{
  "entries": [
    {
      "date": "10/6/25",
      "productionUnitName": "Divetti" | null,
      "areaHa": 3 | null,
      "productName": "FOLPEC",
      "quantity": 4.5,
      "unitOfMeasure": "kg",
      "waterQuantityL": 2000 | null
    }
  ]
}

IMPORTANTE:
- Restituisci SOLO l'oggetto JSON con la chiave "entries", senza commenti o markdown.
- Un entry per OGNI combinazione (data, unità produttiva, prodotto).
- NON inventare dati. Se un valore non è leggibile, omettilo o usa null.
- Converti SEMPRE le virgole decimali in punti.`;

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function parseDateToISO(dateStr: string): string {
  // Handle formats: DD/MM/YY, DD-MM-YY, DD/MM, DD-MM
  const cleaned = dateStr.replace(/\s+/g, '').trim();
  const parts = cleaned.split(/[/\-]/);

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  let year: number;
  if (parts.length >= 3 && parts[2]) {
    const yearPart = parseInt(parts[2], 10);
    year = yearPart < 100 ? 2000 + yearPart : yearPart;
  } else {
    year = new Date().getFullYear();
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString();
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
      .trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const recordValue = value as Record<string, unknown>;
    const candidates = ['value', 'quantity', 'amount', 'numero'];
    for (const key of candidates) {
      const parsed = parseNumericValue(recordValue[key]);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizeRawEntries(entries: BrogliaccioRawEntry[]): BrogliaccioRawEntry[] {
  return entries
    .map((entry) => {
      const parsedQuantity = parseNumericValue(entry.quantity);
      const parsedArea = parseNumericValue(entry.areaHa);
      const parsedWater = parseNumericValue(entry.waterQuantityL);
      if (parsedQuantity === null || parsedQuantity <= 0) {
        return null;
      }
      const normalizedUnit =
        entry.unitOfMeasure?.toString().trim().toLowerCase() === 'ky' ? 'kg' : entry.unitOfMeasure;
      return {
        ...entry,
        quantity: parsedQuantity,
        areaHa: parsedArea,
        waterQuantityL: parsedWater,
        unitOfMeasure: normalizedUnit,
      };
    })
    .filter((entry): entry is BrogliaccioRawEntry => entry !== null);
}

async function callGptVisionForBrogliaccio(
  imageBase64: string,
  mimeType: string,
): Promise<BrogliaccioRawEntry[]> {
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY or OPENAI_API_KEY is required');
  }

  console.log('[BROGLIACCIO_EXTRACTION] Calling vision model...');
  const startTime = Date.now();

  const result = await fetchVisionCompletion({
    messages: [
      {
        role: 'system',
        content:
          'Sei un esperto agronomo italiano specializzato nella lettura di brogliacci manoscritti di trattamenti fitosanitari. Restituisci SOLO un oggetto JSON valido con chiave "entries" (array di trattamenti).',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          buildImageContentPart(imageBase64, mimeType, 'high'),
        ],
      },
    ],
    maxTokens: 8000,
    temperature: 0.1,
    responseFormat: { type: 'json_object' },
  });

  const elapsed = Date.now() - startTime;
  console.log(`[BROGLIACCIO_EXTRACTION] Vision responded in ${elapsed}ms`);

  const rawContent = result.content;

  if (!rawContent) {
    throw new Error('Vision model returned empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    // Try to extract JSON array from the response
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse GPT response as JSON: ${rawContent.substring(0, 500)}`);
    }
  }

  // Handle multiple possible wrapper formats: { entries: [...] }, [...], { data: [...] }, etc.
  let entries: BrogliaccioRawEntry[];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const entriesArray = obj.entries;
    if (Array.isArray(entriesArray)) {
      entries = entriesArray as BrogliaccioRawEntry[];
    } else {
      const arrayValue = Object.values(obj).find((v) => Array.isArray(v));
      entries = (arrayValue as BrogliaccioRawEntry[] | undefined) ?? [];
    }
  } else {
    entries = [];
  }

  console.log(`[BROGLIACCIO_EXTRACTION] Extracted ${entries.length} raw entries`);
  const normalizedEntries = normalizeRawEntries(entries);
  const discardedEntriesCount = entries.length - normalizedEntries.length;
  if (discardedEntriesCount > 0) {
    console.warn(
      `[BROGLIACCIO_EXTRACTION] Discarded ${discardedEntriesCount} entries with invalid quantity`,
    );
  }
  return normalizedEntries;
}

function transformToPayload(rawEntries: BrogliaccioRawEntry[]): BrogliaccioJobPayload[] {
  // Group by (date, productionUnitName)
  const groups = new Map<string, BrogliaccioRawEntry[]>();

  for (const entry of rawEntries) {
    const unitName = entry.productionUnitName ?? '__null__';
    const key = `${entry.date}___${unitName}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const payloads: BrogliaccioJobPayload[] = [];

  for (const [, entries] of groups) {
    const first = entries[0];
    const unitName = first.productionUnitName ?? null;
    const areaHa = first.areaHa ?? null;

    // Sum all product quantities for this group as the total job quantity
    const totalQuantity = entries.reduce((sum, e) => sum + e.quantity, 0);
    // Use the first entry's unit of measure for the job-level quantity
    const primaryUom = entries[0].unitOfMeasure || 'L';

    // Get water quantity (should be same for all entries in the group)
    const waterQuantityL = entries.find((e) => e.waterQuantityL != null)?.waterQuantityL ?? null;

    const stocks = entries.map((e) => ({
      product: {
        name: e.productName,
        category: 'PESTICIDE' as const,
        type: 'Fitosanitario' as const,
        registrationNumber: null as string | null,
      },
      quantity: -Math.abs(e.quantity),
      unitOfMeasureQuantity: e.unitOfMeasure || 'L',
      type: 'OUT' as const,
    }));

    let isoDate: string;
    try {
      isoDate = parseDateToISO(first.date);
    } catch {
      console.warn(
        `[BROGLIACCIO_EXTRACTION] Failed to parse date "${first.date}", using current date`,
      );
      isoDate = new Date().toISOString();
    }

    payloads.push({
      productionUnitName: unitName,
      dateOfOpeation: isoDate,
      category: 'TREATMENT',
      quantity: Math.round(totalQuantity * 1000) / 1000,
      unitOfMeasureQuantity: primaryUom,
      treatedSurface: areaHa,
      totalDistributedWaterL: waterQuantityL,
      stocks,
    });
  }

  // Sort by date, then by production unit name
  payloads.sort((a, b) => {
    const dateCompare = a.dateOfOpeation.localeCompare(b.dateOfOpeation);
    if (dateCompare !== 0) return dateCompare;
    return (a.productionUnitName ?? '').localeCompare(b.productionUnitName ?? '');
  });

  return payloads;
}

export class ExtractDataFromBrogliaccioService {
  async execute(params: {
    imageBuffer: Buffer;
    fileName: string;
  }): Promise<BrogliaccioExtractionResult> {
    const { imageBuffer, fileName } = params;
    console.log(`[BROGLIACCIO_EXTRACTION] Starting extraction for: ${fileName}`);
    const startTime = Date.now();

    const mimeType = getMimeType(fileName);
    const imageBase64 = imageBuffer.toString('base64');

    const rawEntries = await callGptVisionForBrogliaccio(imageBase64, mimeType);
    const payload = transformToPayload(rawEntries);

    const elapsed = Date.now() - startTime;
    console.log(
      `[BROGLIACCIO_EXTRACTION] Extraction completed in ${elapsed}ms. ` +
        `${rawEntries.length} raw entries → ${payload.length} job payloads`,
    );

    return { rawEntries, payload };
  }
}
