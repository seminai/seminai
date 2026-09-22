import { DosageAgentContext, hasContext } from '../agents/dosage_agent/context';
import { SianHtmlParser } from './sian-html-parser';
import { DosageLoggerService } from '../dosage-logger.service';
import { SianInvalidResponseError, SianNotFoundError, SianParseError, SianTransientError } from './sian-errors';
import { uploadSianPdf } from './sian-pdf-storage';
import { ACTION_URL, BASE_URL, GetLinkLabelInput, GetLinkLabelOutput, INIT_URL, SEARCH_URL, SianHttpClient, absolutize, classifyHtmlResponse, sleep, tryParseHtmlForPdfLink } from './getLinkLabelSian.part-01-base-url';

export class SianLabelScraper {
  private readonly context?: DosageAgentContext;
  private readonly parser: SianHtmlParser;

  constructor(context?: DosageAgentContext) {
    this.context = context;
    this.parser = new SianHtmlParser({
      info: (message, metadata) => this.logSian(message, metadata),
      error: (message, metadata) => this.logSianError(message, metadata),
    });
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
    const regResult = this.parser.extractSubmitAndRegistration(regHtml, name, regNumber);
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
    const nameResult = this.parser.extractSubmitAndRegistration(nameHtml, name, regNumber);
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
      const url = await uploadSianPdf({ buffer: pdfBuffer, userId, name, registrationNumber: regNumber });
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
          const url = await uploadSianPdf({ buffer: pdfBuffer, userId, name, registrationNumber: regNumber });
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


}

export async function getLinkLabelSian(params: GetLinkLabelInput): Promise<GetLinkLabelOutput> {
  const scraper = new SianLabelScraper(params.context);
  return await scraper.execute(params);
}
