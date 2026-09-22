import { buildImageContentPart, fetchVisionCompletion } from '../llm-vision-client';
import { DISCIPLINARE_TABLE_PROMPT, ExtractedTable, PageImage, SubstanceGroupLimit } from './tableAwareExtractor.part-01-max-pages';

/**
 * Process a single page with GPT-4o Vision for table extraction
 */
export async function processPageForTables(
  image: PageImage,
  totalPages: number,
): Promise<{ text: string; groupLimits: SubstanceGroupLimit[] }> {
  const prompt = `${DISCIPLINARE_TABLE_PROMPT}

PAGINA ${image.pageNumber} di ${totalPages}

Analizza questa immagine e restituisci:
1. Il testo estratto con le tabelle in formato Markdown
2. I vincoli di gruppo trovati nel formato richiesto

Rispondi SOLO con i dati estratti.`;

  const result = await fetchVisionCompletion({
    messages: [
      {
        role: 'system',
        content:
          "Sei un esperto nell'estrazione di tabelle da disciplinari di produzione integrata. Estrai fedelmente tutte le tabelle e i vincoli di gruppo preservando la struttura in Markdown.",
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          buildImageContentPart(image.base64, image.mimeType, 'high'),
        ],
      },
    ],
    maxTokens: 8000,
    temperature: 0.1,
  });

  const rawContent = result.content;

  // Parse group limits from the extracted text
  const groupLimits = parseGroupLimits(rawContent);

  return { text: rawContent, groupLimits };
}

/**
 * Parse substance group limits from extracted text
 */
export function parseGroupLimits(text: string): SubstanceGroupLimit[] {
  const limits: SubstanceGroupLimit[] = [];

  // Pattern 1: "X interventi tra Sostanza1, Sostanza2 e Sostanza3"
  const pattern1 = /(\d+)\s+interventi?\s+tra\s+([^.|\n]+)/gi;
  let match;

  while ((match = pattern1.exec(text)) !== null) {
    const maxInterventions = parseInt(match[1], 10);
    const substancesStr = match[2];

    // Parse substances (comma or "e" separated)
    const substances = substancesStr
      .split(/[,e]/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.match(/^\d+$/));

    if (substances.length >= 2) {
      limits.push({
        substances,
        maxInterventions,
        scope: 'anno',
        diseases: [],
        notes: null,
      });
    }
  }

  // Pattern 2: "[GRUPPO_SOSTANZE: ... | MAX_INTERVENTI: X | SCOPE: ...]"
  const pattern2 =
    /\[GRUPPO_SOSTANZE:\s*([^|]+)\|\s*MAX_INTERVENTI:\s*(\d+)\s*\|\s*SCOPE:\s*(\w+)\]/gi;

  while ((match = pattern2.exec(text)) !== null) {
    const substances = match[1]
      .split(/[,e]/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const maxInterventions = parseInt(match[2], 10);
    const scope = match[3].toLowerCase() as 'anno' | 'ciclo' | 'stagione';

    limits.push({
      substances,
      maxInterventions,
      scope,
      diseases: [],
      notes: null,
    });
  }

  // Deduplicate by substances
  const uniqueLimits: SubstanceGroupLimit[] = [];
  const seen = new Set<string>();

  for (const limit of limits) {
    const key = limit.substances.sort().join(',').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLimits.push(limit);
    }
  }

  return uniqueLimits;
}

/**
 * Parse Markdown tables from text
 */
export function parseMarkdownTables(text: string, pageNumber: number): ExtractedTable[] {
  const tables: ExtractedTable[] = [];

  // Split by potential table boundaries
  const lines = text.split('\n');
  let currentTable: { headers: string[]; rows: string[][]; startLine: number } | null = null;
  let context: ExtractedTable['context'] = { pageNumber };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for context headers (section names)
    if (line.match(/^#+\s*(.+)/) || line.match(/^[A-Z][A-Z\s]+$/)) {
      const headerMatch = line.match(/^#+\s*(.+)/) || [null, line];
      if (headerMatch[1]) {
        if (headerMatch[1].toLowerCase().includes('crittogam')) {
          context = { ...context, section: 'CRITTOGAME' };
        } else if (headerMatch[1].toLowerCase().includes('vite')) {
          context = { ...context, crop: 'Vite' };
        }
      }
    }

    // Check for table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Check if it's a separator row (e.g., |---|---|)
      if (cells.every((c) => c.match(/^[-:]+$/))) {
        continue;
      }

      if (!currentTable) {
        // Start new table with this as header
        currentTable = { headers: cells, rows: [], startLine: i };
      } else {
        // Add as row
        currentTable.rows.push(cells);
      }
    } else if (currentTable && currentTable.rows.length > 0) {
      // End of table
      tables.push({
        headers: currentTable.headers,
        rows: currentTable.rows,
        context,
        rawMarkdown: lines
          .slice(currentTable.startLine, i)
          .filter((l) => l.trim().startsWith('|'))
          .join('\n'),
      });
      currentTable = null;
    }
  }

  // Handle table at end of text
  if (currentTable && currentTable.rows.length > 0) {
    tables.push({
      headers: currentTable.headers,
      rows: currentTable.rows,
      context,
      rawMarkdown: lines
        .slice(currentTable.startLine)
        .filter((l) => l.trim().startsWith('|'))
        .join('\n'),
    });
  }

  return tables;
}
