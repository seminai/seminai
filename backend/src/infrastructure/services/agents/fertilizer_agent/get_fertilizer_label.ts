import axios, { type AxiosInstance } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { convertPdfToTextWithPositionalAnaylsis } from '../../ocr/pdfToText';
import { requireConfiguredFeature } from '../../../runtime/requireConfiguredFeature';

const TAVILY_BASE_URL: string = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS: number = 15000;
const MAX_TAVILY_RESULTS: number = 15;
const MAX_GOOGLE_RESULTS: number = 15;
const MAX_LABEL_PAGES: number = 10;
const MAX_LABELS_PER_PRODUCT: number = 3;
const LABEL_QUERY_SUFFIX: string = 'fertilizer label pdf';
const REQUIRED_SECTIONS: ReadonlyArray<RegExp> = [
  /(composizione|composition)/i,
  /(dosi|dosage|impiego|application)/i,
  /(varietà|varieta|variety|colture|crops)/i,
];
const MIN_NAME_TOKEN_LENGTH: number = 4;

interface TavilySearchResult {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score?: number;
}

interface TavilySearchResponse {
  readonly results: ReadonlyArray<TavilySearchResult>;
}

type TavilySearchFn = (query: string) => Promise<ReadonlyArray<TavilySearchResult>>;

interface TavilySearchDeps {
  readonly apiKey?: string;
  readonly httpClient?: AxiosInstance;
}

type GoogleFallbackFn = (query: string) => Promise<ReadonlyArray<string>>;

type PdfDownloadFn = (url: string) => Promise<{ path: string }>;
type PdfTextExtractionFn = (pdfPath: string) => Promise<{ text: string; pageCount: number }>;

interface FertilizerLabelServiceDeps {
  readonly searchFn?: TavilySearchFn;
  readonly googleFallbackFn?: GoogleFallbackFn;
  readonly downloadFn?: PdfDownloadFn;
  readonly extractTextFn?: PdfTextExtractionFn;
}

export interface FertilizerLabelRecord {
  readonly productName: string;
  readonly labelName: string;
  readonly url: string;
  readonly pageCount: number;
  readonly preview: string;
}

export interface FertilizerLabelService {
  getLabelLinks(fertilizerName: string): Promise<ReadonlyArray<FertilizerLabelRecord>>;
}

function createTavilySearchFn(deps: TavilySearchDeps = {}): TavilySearchFn {
  const apiKey: string = requireConfiguredFeature(
    'Tavily',
    deps.apiKey ?? process.env.TAVILY_API_KEY,
  );
  const httpClient: AxiosInstance =
    deps.httpClient ?? axios.create({ baseURL: TAVILY_BASE_URL, timeout: TAVILY_TIMEOUT_MS });
  return async (query: string): Promise<ReadonlyArray<TavilySearchResult>> => {
    const payload = {
      api_key: apiKey,
      query,
      search_depth: 'advanced' as const,
      max_results: MAX_TAVILY_RESULTS,
    };
    try {
      const response = await httpClient.post<TavilySearchResponse>('', payload);
      return response.data.results ?? [];
    } catch (error) {
      const message: string = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`Failed to query Tavily: ${message}`);
    }
  };
}

async function downloadPdfToTemp(url: string): Promise<{ path: string }> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: TAVILY_TIMEOUT_MS,
  });
  const contentType = response.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('pdf')) {
    throw new Error(`URL is not a PDF (${url})`);
  }
  const tmpPath = path.join(
    os.tmpdir(),
    `fertilizer-label-${Date.now()}-${crypto.randomUUID()}.pdf`,
  );
  const arrayBuffer = response.data as ArrayBuffer;
  const buffer = new Uint8Array(arrayBuffer);
  await fs.promises.writeFile(tmpPath, buffer);
  return { path: tmpPath };
}

async function extractPdfText(pdfPath: string): Promise<{ text: string; pageCount: number }> {
  const { text, pageCount } = await convertPdfToTextWithPositionalAnaylsis(pdfPath);
  return { text, pageCount };
}

function isPdfUrl(url: string): boolean {
  const normalized: string = url.toLowerCase();
  return normalized.includes('.pdf');
}

function sanitizeGoogleUrl(rawUrl: string): string | null {
  try {
    const decoded = decodeURIComponent(rawUrl);
    if (!decoded.startsWith('http')) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

async function searchGoogleForPdfLinks(query: string): Promise<ReadonlyArray<string>> {
  const params = new URLSearchParams({
    q: `${query} filetype:pdf`,
    hl: 'it',
    num: String(MAX_GOOGLE_RESULTS),
  });
  const response = await axios.get<string>('https://www.google.com/search', {
    params,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    timeout: TAVILY_TIMEOUT_MS,
  });
  const matches = Array.from(response.data.matchAll(/href="\/url\?q=([^"&]+)&/g));
  const urls = matches
    .map((match) => sanitizeGoogleUrl(match[1]))
    .filter((url): url is string => Boolean(url))
    .filter((url) => isPdfUrl(url));
  return Array.from(new Set(urls)).slice(0, MAX_GOOGLE_RESULTS);
}

function hasRequiredSections(text: string): boolean {
  return REQUIRED_SECTIONS.every((pattern) => pattern.test(text));
}

function extractNameTokens(name: string): ReadonlyArray<string> {
  return name
    .toLowerCase()
    .split(/[^a-zA-Z]+/g)
    .filter((token) => token.length >= MIN_NAME_TOKEN_LENGTH);
}

function doesTextContainName(text: string, name: string): boolean {
  const normalizedText = text.toLowerCase();
  const tokens = extractNameTokens(name);
  return tokens.length === 0 ? false : tokens.some((token) => normalizedText.includes(token));
}

function buildLabelName(text: string, fallback: string, name: string): string {
  const tokens = extractNameTokens(name);
  if (tokens.length === 0) {
    return fallback;
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (tokens.some((token) => normalized.includes(token))) {
      return line;
    }
  }
  return fallback;
}

function buildPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 220);
}

async function validatePdfLabel(
  url: string,
  fertilizerName: string,
  downloadFn: PdfDownloadFn,
  extractTextFn: PdfTextExtractionFn,
): Promise<FertilizerLabelRecord | null> {
  const { path: pdfPath } = await downloadFn(url);
  try {
    const { text, pageCount } = await extractTextFn(pdfPath);
    if (pageCount === 0 || pageCount > MAX_LABEL_PAGES) {
      return null;
    }
    if (!doesTextContainName(text, fertilizerName)) {
      return null;
    }
    if (!hasRequiredSections(text)) {
      return null;
    }
    const labelName = buildLabelName(text, fertilizerName, fertilizerName);
    return {
      productName: fertilizerName,
      labelName,
      url,
      pageCount,
      preview: buildPreview(text),
    };
  } finally {
    await fs.promises.unlink(pdfPath).catch(() => undefined);
  }
}

export function createFertilizerLabelService(
  deps: FertilizerLabelServiceDeps = {},
): FertilizerLabelService {
  const searchFn: TavilySearchFn = deps.searchFn ?? createTavilySearchFn();
  const googleFallbackFn: GoogleFallbackFn = deps.googleFallbackFn ?? searchGoogleForPdfLinks;
  const downloadFn: PdfDownloadFn = deps.downloadFn ?? downloadPdfToTemp;
  const extractTextFn: PdfTextExtractionFn = deps.extractTextFn ?? extractPdfText;
  const getLabelLinks = async (
    fertilizerName: string,
  ): Promise<ReadonlyArray<FertilizerLabelRecord>> => {
    const trimmedName: string = fertilizerName.trim();
    if (!trimmedName) {
      return [];
    }
    const query: string = `${trimmedName} ${LABEL_QUERY_SUFFIX}`;
    const results = await searchFn(query);
    let pdfUrls: string[] = results
      .map((result) => result.url)
      .filter((url) => isPdfUrl(url))
      .slice(0, MAX_TAVILY_RESULTS);
    if (pdfUrls.length === 0 && googleFallbackFn) {
      pdfUrls = Array.from(await googleFallbackFn(query));
    }
    const settled = await Promise.allSettled(
      pdfUrls.map((url) => validatePdfLabel(url, trimmedName, downloadFn, extractTextFn)),
    );
    const validated = settled
      .filter(
        (item): item is PromiseFulfilledResult<FertilizerLabelRecord | null> =>
          item.status === 'fulfilled',
      )
      .map((item) => item.value)
      .filter((record): record is FertilizerLabelRecord => record !== null)
      .slice(0, MAX_LABELS_PER_PRODUCT);
    return validated;
  };
  return { getLabelLinks };
}

export default createFertilizerLabelService;
