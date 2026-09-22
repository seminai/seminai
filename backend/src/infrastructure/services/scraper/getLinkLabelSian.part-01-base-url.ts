import { SianFailureReason } from './sian-errors';
import { DosageAgentContext, hasContext } from '../agents/dosage_agent/context';
import axios, { AxiosInstance, AxiosResponse, RawAxiosRequestHeaders } from 'axios';
import { DosageLoggerService } from '../dosage-logger.service';

export const BASE_URL = 'https://www.sian.it';

export const INIT_URL = `${BASE_URL}/mimfFitoPub/ricercaInizialeFito.get`;

export const SEARCH_URL = `${BASE_URL}/mimfFitoPub/gestioneRicercaInizialeFito.do`;

export const ACTION_URL = `${BASE_URL}/mimfFitoPub/gestioneRicercaProdottiFito.do`;

export const NOT_FOUND_MARKERS: readonly RegExp[] = [
  /nessun risultato/i,
  /nessun prodotto trovat[oa]/i,
  /prodotto non disponibile/i,
  /non.+trovat[oa]/i,
  /no records? found/i,
];

export const TRANSIENT_MARKERS: readonly RegExp[] = [
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GetLinkLabelInput {
  readonly name: string;
  readonly regNumber: string;
  readonly userId: string;
  readonly context?: DosageAgentContext;
}

export interface GetLinkLabelOutput {
  readonly url: string;
  readonly regNumber: string;
  readonly name: string;
}

export class CookieJarLite {
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

export class SianHttpClient {
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
