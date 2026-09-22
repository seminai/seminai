interface SianParserLogger {
  readonly info: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error: (message: string, metadata?: Record<string, unknown>) => void;
}

interface ParsedSianRow {
  readonly tr: string;
  readonly reg: string;
  readonly regNumeric: string;
  readonly name: string;
}

/** Parse the legacy SIAN results table without performing network or storage I/O. */
export class SianHtmlParser {
  public constructor(private readonly logger: SianParserLogger) {}

  public extractSubmitAndRegistration(
    html: string,
    name: string,
    registrationNumber: string,
  ): { readonly submitName: string | null; readonly nreg: string | null } {
    const normalizedName = this.normalizeSpaces(name).toLowerCase();
    const normalizedRegistration = this.normalizeSpaces(registrationNumber);
    const tableMatch = /<table[^>]*class="table[^"]*"[\s\S]*?<\/table>/i.exec(html);
    const tableHtml = tableMatch ? tableMatch[0] : html;
    const normalizedTable = tableHtml.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');
    const rows = this.parseTableRows(normalizedTable.match(/<tr[\s\S]*?<\/tr>/gi) ?? []);
    const numericRegistration = normalizedRegistration.replace(/^0+/, '') || '0';
    this.logger.info(`[PARSE] Looking for name="${normalizedName}" reg="${normalizedRegistration}"`);
    const exact = rows.find(
      (row) => row.regNumeric === numericRegistration && row.name === normalizedName,
    );
    const registrationMatch = rows.find((row) => row.regNumeric === numericRegistration);
    const nameMatch = rows.find(
      (row) =>
        row.name.length > 0 &&
        (row.name.includes(normalizedName) || normalizedName.includes(row.name)),
    );
    const matched = exact ?? registrationMatch ?? nameMatch;
    if (matched) {
      const extracted = this.extractButtonFromRow(matched.tr);
      if (extracted) return extracted;
    }
    const fallback = this.extractFallback(html, normalizedRegistration);
    if (fallback) return fallback;
    this.logger.error('[PARSE] Product row not found', {
      snippet: normalizedTable.substring(0, 1200),
    });
    return { submitName: null, nreg: null };
  }

  private parseTableRows(trMatches: readonly string[]): readonly ParsedSianRow[] {
    const rows: ParsedSianRow[] = [];
    for (const tr of trMatches) {
      const cells = tr.match(
        /<td[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/i,
      );
      if (!cells) continue;
      const reg = this.normalizeSpaces((cells[1] ?? '').replace(/<[^>]+>/g, ''));
      const name = this.normalizeSpaces((cells[2] ?? '').replace(/<[^>]+>/g, '')).toLowerCase();
      rows.push({ tr, reg, regNumeric: reg.replace(/^0+/, '') || '0', name });
    }
    return rows;
  }

  private extractButtonFromRow(
    tr: string,
  ): { readonly submitName: string; readonly nreg: string } | null {
    const nreg = tr.match(/<input[^>]*name="nreg"[^>]*value="(\d+)"/i)?.[1];
    const submitName = tr.match(/<input[^>]*name="(scaricaEtichetta\d+)"/i)?.[1];
    if (!nreg || !submitName) return null;
    return { submitName, nreg };
  }

  private extractFallback(
    html: string,
    normalizedRegistration: string,
  ): { readonly submitName: string; readonly nreg: string } | null {
    const normalized = html.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');
    const needle = new RegExp(
      `<input[^>]*name="nreg"[^>]*value="${this.escapeRegExp(normalizedRegistration)}"`,
      'i',
    );
    const index = normalized.search(needle);
    if (index < 0) return null;
    const window = normalized.slice(Math.max(0, index - 2000), index + 2000);
    const submitName = window.match(/<input[^>]*name="(scaricaEtichetta\d+)"/i)?.[1];
    return submitName ? { submitName, nreg: normalizedRegistration } : null;
  }

  private normalizeSpaces(input: string): string {
    return input.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
