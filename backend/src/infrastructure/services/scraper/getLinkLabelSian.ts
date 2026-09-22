import axios, { AxiosInstance, AxiosResponse, RawAxiosRequestHeaders } from 'axios';
import { Readable } from 'stream';
import { FileService } from '../FileService';
import { DosageAgentContext, hasContext } from '../agents/dosage_agent/context';
import { DosageLoggerService } from '../dosage-logger.service';
import {
  SianFailureReason,
  SianInvalidResponseError,
  SianNotFoundError,
  SianParseError,
  SianTransientError,
} from './sian-errors';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
  stream?: Readable;
}

const BASE_URL = 'https://www.sian.it';
const INIT_URL = `${BASE_URL}/mimfFitoPub/ricercaInizialeFito.get`;
const SEARCH_URL = `${BASE_URL}/mimfFitoPub/gestioneRicercaInizialeFito.do`;
const ACTION_URL = `${BASE_URL}/mimfFitoPub/gestioneRicercaProdottiFito.do`;

const NOT_FOUND_MARKERS: readonly RegExp[] = [
  /nessun risultato/i,
  /nessun prodotto trovat[oa]/i,
  /prodotto non disponibile/i,
  /non.+trovat[oa]/i,
  /no records? found/i,
];

const TRANSIENT_MARKERS: readonly RegExp[] = [
  /troppe richieste/i,
  /too many requests/i,
  /riprova\s+(piu|più)\s+tardi/i,
  /service\s+(temporaneamente\s+)?(non\s+disponibile|unavailable)/i,
  /\b(50[234]|429)\b/,
  /bad gateway/i,
  /gateway\s+timeout/i,
  // SIAN returns a generic "Errore di sistema" page when its app servers
  // are momentarily failing. Treat it as transient so the caller retries
  // (or falls back to BDF) instead of bubbling up as a hard failure.
  /errore di sistema/i,
  /errore generico/i,
  /errore\.gif/i,
  /<h2>\s*errore\s*<\/h2>/i,
];

/**
 * Tries to extract a follow-up link to a PDF/download/etichetta endpoint from
 * an HTML response. SIAN sometimes wraps the actual PDF behind an HTML page
 * that contains an anchor (`<a href="...">`) pointing to the file.
 */
export function tryParseHtmlForPdfLink(html: string): string | null {
  const candidates: ReadonlyArray<RegExp> = [
    /href="([^"]*\.pdf[^"]*)"/i,
    /href="([^"]*\/download[^"]*)"/i,
    /href="([^"]*\/etichetta[^"]*)"/i,
  ];
  for (const re of candidates) {
    const match = html.match(re);
    if (match && match[1]) return match[1];
  }
  return null;
}

/**
 * Classifies a non-PDF SIAN HTML response so the caller can decide whether
 * to retry (transient), fail-fast (not_found) or surface as unexpected.
 */
export function classifyHtmlResponse(html: string): SianFailureReason {
  for (const re of NOT_FOUND_MARKERS) if (re.test(html)) return 'not_found';
  for (const re of TRANSIENT_MARKERS) if (re.test(html)) return 'transient';
  return 'invalid_response';
}

/** Resolves a possibly-relative href against a base URL. */
export function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GetLinkLabelInput {
  readonly name: string;
  readonly regNumber: string;
  readonly userId: string;
  readonly context?: DosageAgentContext;
}

interface GetLinkLabelOutput {
  readonly url: string;
  readonly regNumber: string;
  readonly name: string;
}

class CookieJarLite {
  private readonly cookieMap: Map<string, string> = new Map<string, string>();

  public setCookieFromSetCookieHeaders(setCookieHeaders: string[] | undefined): void {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return;
    for (const header of setCookieHeaders) {
      const pair = header.split(';')[0];
      const eqIdx = pair.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (name) this.cookieMap.set(name, value);
    }
  }

  public set(name: string, value: string): void {
    this.cookieMap.set(name, value);
  }

  public toHeader(): string {
    return Array.from(this.cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

class SianHttpClient {
  private readonly client: AxiosInstance;
  private readonly jar: CookieJarLite;
  private readonly context?: DosageAgentContext;

  constructor(context?: DosageAgentContext) {
    this.client = axios.create({
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    this.jar = new CookieJarLite();
    this.context = context;
  }

  private logSian(message: string, metadata?: Record<string, unknown>): void {
    console.log(`[SIAN] ${message}`);
    if (hasContext(this.context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logSian({
        jobId: this.context.jobId,
        userId: this.context.userId,
        message,
        metadata,
      });
    }
  }

  // private logSianError(message: string, metadata?: Record<string, unknown>): void {
  //   console.error(`[SIAN] ${message}`);
  //   if (hasContext(this.context)) {
  //     const logger = DosageLoggerService.getInstance();
  //     logger.logSian({
  //       jobId: this.context.jobId,
  //       userId: this.context.userId,
  //       message,
  //       metadata: { ...metadata, level: 'error' },
  //     });
  //   }
  // }

  public async get(url: string, headers?: RawAxiosRequestHeaders): Promise<AxiosResponse> {
    const res = await this.client.get(url, { headers: this.buildHeaders(headers) });
    this.jar.setCookieFromSetCookieHeaders(res.headers['set-cookie']);
    this.logSian(`[GET] ${url} -> status: ${res.status}`, { url, status: res.status });
    return res;
  }

  public async postForm(
    url: string,
    data: Record<string, string>,
    headers?: RawAxiosRequestHeaders,
  ): Promise<AxiosResponse> {
    const body = new URLSearchParams(data).toString();
    const res = await this.client.post(url, body, {
      headers: this.buildHeaders({
        'content-type': 'application/x-www-form-urlencoded',
        ...(headers || {}),
      }),
      responseType: 'arraybuffer',
    });
    this.jar.setCookieFromSetCookieHeaders(res.headers['set-cookie']);
    const contentType = String(res.headers['content-type'] || '');
    this.logSian(`[POST] ${url} -> status: ${res.status}, content-type: ${contentType}`, {
      url,
      status: res.status,
      contentType,
    });
    return res;
  }

  private buildHeaders(extra?: RawAxiosRequestHeaders): RawAxiosRequestHeaders {
    return {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'cache-control': 'no-cache',
      dnt: '1',
      origin: BASE_URL,
      pragma: 'no-cache',
      'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      cookie: this.jar.toHeader(),
      ...(extra || {}),
    } as RawAxiosRequestHeaders;
  }

  public seedCookie(name: string, value: string): void {
    this.jar.set(name, value);
  }
}

class SianLabelScraper {
  private readonly context?: DosageAgentContext;

  constructor(context?: DosageAgentContext) {
    this.context = context;
  }

  private logSian(message: string, metadata?: Record<string, unknown>): void {
    console.log(`[SIAN] ${message}`);
    if (hasContext(this.context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logSian({
        jobId: this.context.jobId,
        userId: this.context.userId,
        message,
        metadata,
      });
    }
  }

  private logSianError(message: string, metadata?: Record<string, unknown>): void {
    console.error(`[SIAN] ${message}`);
    if (hasContext(this.context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logSian({
        jobId: this.context.jobId,
        userId: this.context.userId,
        message,
        metadata: { ...metadata, level: 'error' },
      });
    }
  }

  public async execute(params: GetLinkLabelInput): Promise<GetLinkLabelOutput> {
    const { name, regNumber, userId, context } = params;
    const http = new SianHttpClient(context);
    http.seedCookie('f5_cspm', '1234');

    // Strategy 1: search by registration number (most precise)
    this.logSian(`[STRATEGY-1] Searching by regNumber="${regNumber}" for "${name}"`, {
      name,
      regNumber,
      strategy: 'regNumber',
    });
    await http.get(INIT_URL);
    const regHtml = await this.performSearch(http, '', regNumber);
    const regResult = this.extractSubmitAndNreg(regHtml, name, regNumber);
    if (regResult.submitName && regResult.nreg) {
      return await this.withTransientRetry(
        () =>
          this.downloadPdfAndUpload(
            http,
            { submitName: regResult.submitName!, nreg: regResult.nreg! },
            userId,
            name,
            regNumber,
          ),
        { name, regNumber },
      );
    }

    // Strategy 2: search by product name (broader, original behavior)
    this.logSian(`[STRATEGY-2] RegNumber search failed, trying name="${name}"`, {
      name,
      regNumber,
      strategy: 'name',
    });
    await http.get(INIT_URL);
    const nameHtml = await this.performSearch(http, name, '');
    const nameResult = this.extractSubmitAndNreg(nameHtml, name, regNumber);
    if (nameResult.submitName && nameResult.nreg) {
      return await this.withTransientRetry(
        () =>
          this.downloadPdfAndUpload(
            http,
            { submitName: nameResult.submitName!, nreg: nameResult.nreg! },
            userId,
            name,
            regNumber,
          ),
        { name, regNumber },
      );
    }

    throw new SianParseError(name, regNumber, 'Etichetta non disponibile o riga non trovata');
  }

  /**
   * Retries the inner fetch on `SianTransientError` with exponential backoff
   * (1s, 2s, 4s). Other errors propagate immediately.
   */
  private async withTransientRetry<T>(
    fn: () => Promise<T>,
    productInfo: { name: string; regNumber: string },
    attempts = 3,
  ): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof SianTransientError)) throw err;
        lastErr = err;
        if (i < attempts - 1) {
          const waitMs = 1000 * Math.pow(2, i);
          this.logSian(
            `[RETRY] transient error for ${productInfo.name} (${productInfo.regNumber}), attempt ${i + 1}/${attempts}, waiting ${waitMs}ms`,
            { ...productInfo, attempt: i + 1, attempts, waitMs },
          );
          await sleep(waitMs);
        }
      }
    }
    throw lastErr;
  }

  private async performSearch(
    http: SianHttpClient,
    searchName: string,
    searchRegNumber: string,
  ): Promise<string> {
    const searchRes = await http.postForm(
      SEARCH_URL,
      {
        'ricerca.tipoRicerca': '0',
        'ricerca.categoriaFitoiatrica': '',
        'ricerca.prodFitosanitario': searchName,
        'ricerca.sostanzaAttivaRicIniz': '',
        'ricerca.classeImpiego': '',
        'ricerca.coltura': '',
        'ricerca.avversitaRicIniz': '',
        '_ricerca.tipologia': 'on',
        '_ricerca.usoProfRicIniz': 'on',
        'ricerca.statoAmministrativo': '',
        'ricerca.numRegistro': searchRegNumber,
        ricercIniz: 'Cerca',
      },
      { referer: INIT_URL },
    );
    const html = Buffer.from(searchRes.data).toString('utf8');
    this.logSian(`[SEARCH_HTML] len=${html.length}`, { htmlLength: html.length });
    this.logSian(`[SEARCH_HTML_SNIPPET] ${html.substring(0, 800)}`, {
      snippet: html.substring(0, 800),
    });
    return html;
  }

  private async downloadPdfAndUpload(
    http: SianHttpClient,
    match: { submitName: string; nreg: string },
    userId: string,
    name: string,
    regNumber: string,
  ): Promise<GetLinkLabelOutput> {
    const pdfRes = await http.postForm(
      ACTION_URL,
      {
        nreg: match.nreg,
        [match.submitName]: '',
      },
      { referer: SEARCH_URL },
    );

    const contentType = String(pdfRes.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('application/pdf')) {
      const pdfBuffer = Buffer.from(pdfRes.data);
      const url = await this.uploadToGcs(pdfBuffer, userId, name, regNumber);
      return { url, regNumber, name };
    }

    const responseHtml = Buffer.from(pdfRes.data).toString('utf8');

    // [A] SIAN sometimes wraps the PDF behind an HTML page with a follow-up link.
    // The regex extraction already existed in the previous implementation but
    // the link was only logged — now we actually follow it.
    const pdfHref = tryParseHtmlForPdfLink(responseHtml);
    if (pdfHref) {
      const followedUrl = absolutize(pdfHref, BASE_URL);
      this.logSian(`[FOLLOW-LINK] HTML response contains PDF link, fetching ${followedUrl}`, {
        name,
        regNumber,
        followedUrl,
      });
      try {
        const followed = await http.get(followedUrl, { referer: ACTION_URL });
        const followedCt = String(followed.headers['content-type'] || '').toLowerCase();
        if (followedCt.includes('application/pdf')) {
          const pdfBuffer = Buffer.from(followed.data);
          const url = await this.uploadToGcs(pdfBuffer, userId, name, regNumber);
          this.logSian(`[FOLLOW-LINK] PDF retrieved via HTML link for ${name} (${regNumber})`, {
            name,
            regNumber,
          });
          return { url, regNumber, name };
        }
        this.logSianError(
          `[FOLLOW-LINK] Followed link did not return a PDF (content-type=${followedCt})`,
          { name, regNumber, followedUrl, followedCt },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logSianError(`[FOLLOW-LINK] Failed to fetch ${followedUrl}: ${message}`, {
          name,
          regNumber,
          followedUrl,
          message,
        });
      }
    }

    // [B] No PDF retrievable: classify the HTML and throw a typed error so the
    // caller can either retry (transient) or fail-fast (not_found).
    const reason = classifyHtmlResponse(responseHtml);
    this.logSianError(`[ERROR] Risposta non PDF per ${name} (${regNumber}) — reason=${reason}`, {
      name,
      regNumber,
      contentType,
      reason,
      responseLength: responseHtml.length,
    });
    if (reason === 'not_found') throw new SianNotFoundError(name, regNumber);
    if (reason === 'transient') throw new SianTransientError(name, regNumber);
    throw new SianInvalidResponseError(name, regNumber);
  }

  private normalizeSpaces(input: string): string {
    return input
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractSubmitAndNreg(
    html: string,
    name: string,
    regNumber: string,
  ): { submitName: string | null; nreg: string | null } {
    const normalizedName = this.normalizeSpaces(name).toLowerCase();
    const normalizedReg = this.normalizeSpaces(regNumber);
    const tableSectionRegex = /<table[^>]*class="table[^"]*"[\s\S]*?<\/table>/i;
    const tableMatch = tableSectionRegex.exec(html);
    const tableHtml = tableMatch ? tableMatch[0] : html;
    const normalizedTable = tableHtml.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');

    const trMatches = normalizedTable.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    this.logSian(`[PARSE] tr count: ${trMatches.length}`, { trCount: trMatches.length });
    this.logSian(`[PARSE] Looking for name="${normalizedName}" reg="${normalizedReg}"`, {
      normalizedName,
      normalizedReg,
    });

    const normalizedRegNumeric = normalizedReg.replace(/^0+/, '') || '0';
    const parsedRows = this.parseTableRows(trMatches);

    // Pass 1: exact match on both regNumber AND name
    for (const row of parsedRows) {
      if (row.regNumeric === normalizedRegNumeric && row.name === normalizedName) {
        this.logSian(`[PARSE] Exact match (reg+name): "${row.name}" reg=${row.reg}`, {
          matchType: 'exact',
        });
        const extracted = this.extractButtonFromRow(row.tr);
        if (extracted) return extracted;
      }
    }

    // Pass 2: match on regNumber only (name may differ on SIAN)
    for (const row of parsedRows) {
      if (row.regNumeric === normalizedRegNumeric) {
        this.logSian(
          `[PARSE] RegNumber-only match: reg=${row.reg}, sianName="${row.name}" vs expected="${normalizedName}"`,
          { matchType: 'regNumber-only', sianName: row.name },
        );
        const extracted = this.extractButtonFromRow(row.tr);
        if (extracted) return extracted;
      }
    }

    // Pass 3: fuzzy name match (SIAN name contains our name or vice versa)
    for (const row of parsedRows) {
      const nameContains = row.name.includes(normalizedName) || normalizedName.includes(row.name);
      if (nameContains && row.name.length > 0) {
        this.logSian(
          `[PARSE] Fuzzy name match: sianName="${row.name}" vs expected="${normalizedName}", reg=${row.reg}`,
          { matchType: 'fuzzy-name', sianName: row.name, sianReg: row.reg },
        );
        const extracted = this.extractButtonFromRow(row.tr);
        if (extracted) return extracted;
      }
    }

    // Fallback: search for hidden nreg input with the requested value
    const whole = html.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');
    const nregNeedle = new RegExp(
      `<input[^>]*name=\"nreg\"[^>]*value=\"${this.escapeRegExp(normalizedReg)}\"`,
      'i',
    );
    const idx = whole.search(nregNeedle);
    if (idx >= 0) {
      const windowStart = Math.max(0, idx - 2000);
      const windowEnd = Math.min(whole.length, idx + 2000);
      const slice = whole.slice(windowStart, windowEnd);
      const submitAround = slice.match(/<input[^>]*name=\"(scaricaEtichetta\d+)\"/i);
      if (submitAround && submitAround[1]) {
        this.logSian('[PARSE][FALLBACK] matched by nreg vicinity', {
          fallback: true,
          normalizedReg,
        });
        return { submitName: submitAround[1], nreg: normalizedReg };
      }
    }

    this.logSianError('[PARSE] Riga non trovata. Tabella (snippet):', {
      snippet: normalizedTable.substring(0, 1200),
    });
    return { submitName: null, nreg: null };
  }

  private parseTableRows(
    trMatches: string[],
  ): ReadonlyArray<{ tr: string; reg: string; regNumeric: string; name: string }> {
    const rows: Array<{ tr: string; reg: string; regNumeric: string; name: string }> = [];
    for (const tr of trMatches) {
      const firstTwoTds = tr.match(
        /<td[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/i,
      );
      if (!firstTwoTds) continue;
      const tdRegRaw = firstTwoTds[1] || '';
      const tdNameRaw = firstTwoTds[2] || '';
      const reg = this.normalizeSpaces(tdRegRaw.replace(/<[^>]+>/g, ''));
      const regNumeric = reg.replace(/^0+/, '') || '0';
      const name = this.normalizeSpaces(tdNameRaw.replace(/<[^>]+>/g, '')).toLowerCase();
      this.logSian(`[PARSE] Found row: reg="${reg}" (normalized: "${regNumeric}") name="${name}"`, {
        tdReg: reg,
        tdRegNumeric: regNumeric,
        tdName: name,
      });
      rows.push({ tr, reg, regNumeric, name });
    }
    return rows;
  }

  private extractButtonFromRow(tr: string): { submitName: string; nreg: string } | null {
    const nregMatch = tr.match(/<input[^>]*name=\"nreg\"[^>]*value=\"(\d+)\"/i);
    const submitMatch = tr.match(/<input[^>]*name=\"(scaricaEtichetta\d+)\"/i);
    const foundNreg = nregMatch ? nregMatch[1] : null;
    const foundSubmit = submitMatch ? submitMatch[1] : null;
    this.logSian(`[PARSE] Match found! nreg=${foundNreg}, submit=${foundSubmit}`, {
      foundNreg,
      foundSubmit,
    });
    if (foundNreg && foundSubmit) {
      this.logSian(`[PARSE] ✓ Successfully extracted submit button`, { nreg: foundNreg });
      return { submitName: foundSubmit, nreg: foundNreg };
    }
    return null;
  }

  private escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async uploadToGcs(
    buffer: Buffer,
    userId: string,
    name: string,
    regNumber: string,
  ): Promise<string> {
    const fileService = new FileService(userId);
    const originalName = `${this.sanitizeFilename(name)}_${regNumber}.pdf`;
    const multerFile = {
      fieldname: 'file',
      originalname: originalName,
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: buffer.length,
      destination: '',
      filename: originalName,
      path: '',
      buffer,
      stream: Readable.from(buffer),
    } as unknown as MulterFile;
    return await fileService.uploadFile(multerFile, userId, 'labelSian', 'sian-label');
  }

  private sanitizeFilename(input: string): string {
    return this.normalizeSpaces(input).replace(/[^a-zA-Z0-9-_\.]/g, '_');
  }
}

export async function getLinkLabelSian(params: GetLinkLabelInput): Promise<GetLinkLabelOutput> {
  const scraper = new SianLabelScraper(params.context);
  return await scraper.execute(params);
}
