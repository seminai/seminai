// import puppeteer, { Browser, LaunchOptions, Page } from 'puppeteer';
// import { Readable } from 'stream';
// import { FileService } from '../FileService';

// interface FillOptions {
//   readonly headless?: boolean;
//   readonly slowMoMs?: number;
//   readonly navigationTimeoutMs?: number;
//   readonly keepOpenMs?: number;
//   readonly devtools?: boolean;
//   readonly executablePath?: string;
//   readonly args?: string[];
// }

// const FITOSANITARI_URL =
//   'https://www.fitosanitari.salute.gov.it/fitosanitariws_new/FitosanitariServlet' as const;
// const INPUT_SELECTOR_ID = '#chiav' as const;
// const SEARCH_BUTTON_SELECTOR = "input[type='submit'][value='Ricerca']" as const;
// const DEFAULT_NAV_TIMEOUT_MS = 30000 as const;
// const DEFAULT_WINDOW_SIZE = { width: 1024, height: 768 } as const;

// type TableContent = {
//   readonly index: number;
//   readonly headers: ReadonlyArray<string>;
//   readonly rows: ReadonlyArray<ReadonlyArray<string>>;
// };

// type PageTables = {
//   readonly pageIndex: number;
//   readonly title: string;
//   readonly url: string;
//   readonly tables: ReadonlyArray<TableContent>;
//   readonly error?: string;
// };

// type LabelRowMetadata = {
//   readonly pageIndex: number;
//   readonly registrationNumber: string;
//   readonly productName: string;
//   readonly registrationDate?: string;
//   readonly authorizationExpiryDate?: string;
//   readonly href: string;
//   readonly anchorText: string;
// };

// type EnrichedLabelItem = {
//   readonly pageIndex: number;
//   readonly productName: string;
//   readonly registrationNumber: string;
//   readonly registrationDate?: string;
//   readonly authorizationExpiryDate?: string;
//   readonly href: string;
//   readonly anchorText: string;
//   readonly absoluteUrl: string;
//   readonly uploadedUrl?: string;
//   readonly fileName?: string;
// };

// function guessChromePath(): string | undefined {
//   const macPaths: string[] = [
//     '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
//     '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
//     '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
//   ];
//   for (const p of macPaths) {
//     try {
//       // Lazy check via require('fs').existsSync to avoid top-level import
//       // eslint-disable-next-line @typescript-eslint/no-var-requires
//       const fs = require('fs') as { existsSync: (path: string) => boolean };
//       if (fs.existsSync(p)) return p;
//     } catch (_err) {
//       // ignore
//     }
//   }
//   return undefined;
// }

/**
 * Opens the Fitosanitari page and fills the input with id "chiav" with the provided name.
 * By default runs headful (headless=false) to visually inspect interactions during tests.
 */
// export async function fillFitosanitariNameField(params: {
//   readonly name: string;
//   readonly options?: FillOptions;
//   readonly userId?: string;
// }): Promise<{
//   readonly windows: ReadonlyArray<{
//     readonly index: number;
//     readonly title: string;
//     readonly url: string;
//   }>;
//   readonly tablesByPage: ReadonlyArray<PageTables>;
//   readonly labels: ReadonlyArray<{
//     readonly pageIndex: number;
//     readonly anchorText: string;
//     readonly href: string;
//     readonly absoluteUrl: string;
//     readonly uploadedUrl?: string;
//     readonly fileName?: string;
//     readonly error?: string;
//   }>;
//   readonly labelRows: ReadonlyArray<LabelRowMetadata>;
//   readonly items: ReadonlyArray<EnrichedLabelItem>;
// }> {
//   const effectiveOptions: FillOptions = params.options ?? {};
//   const runHeadless: boolean = effectiveOptions.headless ?? true;
//   const executablePath: string | undefined =
//     effectiveOptions.executablePath || (runHeadless ? undefined : guessChromePath());
//   const launchOptions: LaunchOptions = {
//     headless: runHeadless,
//     slowMo: effectiveOptions.slowMoMs,
//     devtools: effectiveOptions.devtools ?? false,
//     executablePath,
//     defaultViewport: null,
//     args: effectiveOptions.args ?? [
//       `--window-size=${DEFAULT_WINDOW_SIZE.width},${DEFAULT_WINDOW_SIZE.height}`,
//       '--disable-gpu',
//       '--no-sandbox',
//       '--disable-dev-shm-usage',
//       '--disable-extensions',
//       '--disable-background-networking',
//       '--disable-background-timer-throttling',
//       '--disable-renderer-backgrounding',
//       '--disable-infobars',
//       '--no-default-browser-check',
//       '--mute-audio',
//       '--blink-settings=imagesEnabled=false',
//     ],
//   };
// const browser: Browser = await puppeteer.launch(launchOptions);
// try {
//   const page: Page = await browser.newPage();
//   const timeoutMs: number = effectiveOptions.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;
//   // Block heavy resource types to reduce bandwidth and memory footprint
//   await page.setRequestInterception(true);
//   page.on('request', (req) => {
//     try {
//       const type = req.resourceType();
//       if (
//         type === 'image' ||
//         type === 'media' ||
//         type === 'font' ||
//         type === 'stylesheet' ||
//         type === 'texttrack'
//       ) {
//         req.abort();
//       } else {
//         req.continue();
//       }
//     } catch (_e) {
//       try {
//         req.continue();
//       } catch {
//         /* ignore */
//       }
//     }
//   });
//   page.setDefaultNavigationTimeout(timeoutMs);
//   await page.setViewport({
//     width: DEFAULT_WINDOW_SIZE.width,
//     height: DEFAULT_WINDOW_SIZE.height,
//     deviceScaleFactor: 1,
//   });
//   await page.goto(FITOSANITARI_URL, { waitUntil: 'domcontentloaded' });
//   await page.waitForSelector(INPUT_SELECTOR_ID, { visible: true, timeout: timeoutMs });
//   await page.bringToFront();
//   await new Promise<void>((resolve) => setTimeout(resolve, 800));
//   await page.focus(INPUT_SELECTOR_ID);
//   await page.$eval(INPUT_SELECTOR_ID, (inputEl: unknown) => {
//     const element = inputEl as { value?: string };
//     if (typeof element.value === 'string') {
//       element.value = '';
//     }
//   });
//   await page.type(INPUT_SELECTOR_ID, params.name, { delay: 30 });
//   await page.waitForSelector(SEARCH_BUTTON_SELECTOR, { visible: true, timeout: timeoutMs });
//   await page.click(SEARCH_BUTTON_SELECTOR);
//   await new Promise<void>((resolve) => setTimeout(resolve, 1500));
//   const allPagesAfterClick: Page[] = await browser.pages();
//   const windowsInfo: ReadonlyArray<{
//     readonly index: number;
//     readonly title: string;
//     readonly url: string;
//   }> = await Promise.all(
//     allPagesAfterClick.map(async (pg: Page, idx: number) => ({
//       index: idx,
//       title: await pg.title(),
//       url: pg.url(),
//     })),
//   );
//   // Avoid logging to reduce noise and overhead in headless mode

//   // For each open page, try to extract table contents (headers + rows)
//   const tablesByPage: ReadonlyArray<PageTables> = await Promise.all(
//     allPagesAfterClick.map(async (pg: Page, idx: number): Promise<PageTables> => {
//       try {
//         try {
//           await pg.waitForSelector('table', { timeout: 3000 });
//         } catch (_err) {
//           // ignore timeout (no table found quickly)
//         }
//         const tables: ReadonlyArray<TableContent> = await pg.evaluate(() => {
//           const getDocument = (): unknown =>
//             (globalThis as unknown as { document?: unknown }).document;
//           const doc = getDocument();
//           if (!doc)
//             return [] as ReadonlyArray<{ index: number; headers: string[]; rows: string[][] }>;
//           const queryAll = (node: unknown, selector: string): ReadonlyArray<unknown> => {
//             const qsa = (node as { querySelectorAll?: (s: string) => unknown }).querySelectorAll;
//             if (typeof qsa !== 'function') return [];
//             const result = qsa.call(node, selector) as unknown;
//             return Array.isArray(result)
//               ? (result as unknown[])
//               : Array.from(result as unknown as Iterable<unknown>);
//           };
//           const getText = (el: unknown): string => {
//             const text = (el as { textContent?: unknown }).textContent;
//             return typeof text === 'string' ? text.trim() : '';
//           };
//           const tableElements = queryAll(doc, 'table');
//           return tableElements.map((tableEl: unknown, tableIdx: number) => {
//             const headerCells = queryAll(tableEl, 'thead tr th');
//             const headers = headerCells.map(getText);
//             const bodyRows = queryAll(tableEl, 'tbody tr');
//             const rows = bodyRows.map((tr: unknown) => queryAll(tr, 'th,td').map(getText));
//             if (headers.length === 0 && rows.length === 0) {
//               const genericRows = queryAll(tableEl, 'tr').map((tr: unknown) =>
//                 queryAll(tr, 'th,td').map(getText),
//               );
//               return { index: tableIdx, headers: [], rows: genericRows };
//             }
//             return { index: tableIdx, headers, rows };
//           }) as unknown as ReadonlyArray<{ index: number; headers: string[]; rows: string[][] }>;
//         });
//         return {
//           pageIndex: idx,
//           title: await pg.title(),
//           url: pg.url(),
//           tables,
//         };
//       } catch (err) {
//         const errorMessage: string = err instanceof Error ? err.message : 'Unknown error';
//         return {
//           pageIndex: idx,
//           title: await pg.title(),
//           url: pg.url(),
//           tables: [],
//           error: errorMessage,
//         };
//       }
//     }),
//   );
//   // Avoid logging large JSON payloads in headless mode

//   // Extract label links (EtichettaServlet anchors) from each page
//   type AnchorInfo = { readonly href: string; readonly text: string };
//   const anchorsPerPage: ReadonlyArray<{
//     readonly pageIndex: number;
//     readonly anchors: ReadonlyArray<AnchorInfo>;
//   }> = await Promise.all(
//     allPagesAfterClick.map(async (pg: Page, idx: number) => {
//       const anchors: ReadonlyArray<AnchorInfo> = await pg.evaluate(() => {
//         const getDocument = (): unknown =>
//           (globalThis as unknown as { document?: unknown }).document;
//         const doc = getDocument();
//         if (!doc) return [] as ReadonlyArray<{ href: string; text: string }>;
//         const queryAll = (node: unknown, selector: string): ReadonlyArray<unknown> => {
//           const qsa = (node as { querySelectorAll?: (s: string) => unknown }).querySelectorAll;
//           if (typeof qsa !== 'function') return [];
//           const result = qsa.call(node, selector) as unknown;
//           return Array.isArray(result)
//             ? (result as unknown[])
//             : Array.from(result as unknown as Iterable<unknown>);
//         };
//         const getAttr = (el: unknown, attr: string): string => {
//           const getter = (el as { getAttribute?: (a: string) => unknown }).getAttribute;
//           const val = typeof getter === 'function' ? getter.call(el, attr) : undefined;
//           return typeof val === 'string' ? val : '';
//         };
//         const getText = (el: unknown): string => {
//           const text = (el as { textContent?: unknown }).textContent;
//           return typeof text === 'string' ? text.trim() : '';
//         };
//         const anchorNodes = queryAll(doc, 'table a[href]');
//         const all = anchorNodes
//           .map((a) => ({ href: getAttr(a, 'href'), text: getText(a) }))
//           .filter(
//             (a) =>
//               a.href.includes('EtichettaServlet') || a.text.toLowerCase().includes('etichetta'),
//           )
//           .filter((a) => a.href.length > 0);
//         return all as ReadonlyArray<{ href: string; text: string }>;
//       });
//       return { pageIndex: idx, anchors };
//     }),
//   );

//   const fileService = new FileService(params.userId);
//   const userIdForUpload: string = params.userId ?? 'system';
//   const labelBase = new URL(FITOSANITARI_URL);
//   const results: Array<{
//     readonly pageIndex: number;
//     readonly anchorText: string;
//     readonly href: string;
//     readonly absoluteUrl: string;
//     readonly uploadedUrl?: string;
//     readonly fileName?: string;
//     readonly error?: string;
//   }> = [];

//   // Download and upload labels sequentially to reduce load
//   for (const ap of anchorsPerPage) {
//     for (const a of ap.anchors) {
//       const absoluteUrl: string = new URL(a.href, labelBase).toString();
//       try {
//         const sourcePage: Page | undefined = allPagesAfterClick[ap.pageIndex];
//         if (!sourcePage) {
//           results.push({
//             pageIndex: ap.pageIndex,
//             anchorText: a.text,
//             href: a.href,
//             absoluteUrl,
//             error: 'source page not found',
//           });
//           continue;
//         }
//         const evalRespUnknown = await sourcePage.evaluate(async (url: string) => {
//           try {
//             const resp = await fetch(url, {
//               method: 'GET',
//               credentials: 'include',
//               headers: {
//                 Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
//               },
//             } as unknown as RequestInit);
//             const contentType = (resp.headers.get('content-type') || '').toLowerCase();
//             const ab = await resp.arrayBuffer();
//             let base64 = '';
//             try {
//               const CHUNK_SIZE = 0x8000;
//               const u8 = new Uint8Array(ab);
//               let binary = '';
//               for (let i = 0; i < u8.length; i += CHUNK_SIZE) {
//                 const chunk = u8.subarray(i, i + CHUNK_SIZE);
//                 let chunkStr = '';
//                 for (let j = 0; j < chunk.length; j++) {
//                   chunkStr += String.fromCharCode(chunk[j]);
//                 }
//                 binary += chunkStr;
//               }
//               base64 = btoa(binary);
//             } catch (e2) {
//               const msg2 =
//                 (e2 && (e2 as { message?: string }).message) || 'base64 conversion failed';
//               return { ok: false, status: resp.status, contentType, error: msg2 };
//             }
//             return { ok: resp.ok, status: resp.status, contentType, base64 };
//           } catch (e) {
//             const msg = (e && (e as { message?: string }).message) || 'unknown';
//             return { ok: false, status: 0, error: msg };
//           }
//         }, absoluteUrl);
//         const evalResp = evalRespUnknown as {
//           ok: boolean;
//           status: number;
//           contentType?: string;
//           base64?: string;
//           error?: string;
//         };
//         if (!evalResp.ok || !evalResp.base64) {
//           results.push({
//             pageIndex: ap.pageIndex,
//             anchorText: a.text,
//             href: a.href,
//             absoluteUrl,
//             error: evalResp.error || `HTTP ${evalResp.status}`,
//           });
//           continue;
//         }
//         const contentType: string = (evalResp.contentType || '').toLowerCase();
//         const isPdf: boolean = contentType.includes('pdf');
//         const pdfBuffer = Buffer.from(evalResp.base64, 'base64');

//         const idMatch = /id=(\d+)/.exec(absoluteUrl);
//         const idSuffix = idMatch && idMatch[1] ? `_${idMatch[1]}` : '';
//         const baseNameFromText =
//           a.text.replace(/[^a-zA-Z0-9_\-\. ]+/g, '_').trim() || 'etichetta';
//         const fileName = `${baseNameFromText}${idSuffix}.pdf`;
//         const fakeFile = {
//           fieldname: 'file',
//           originalname: fileName,
//           encoding: '7bit',
//           mimetype: isPdf ? 'application/pdf' : contentType || 'application/pdf',
//           size: pdfBuffer.length,
//           destination: 'label',
//           filename: fileName,
//           path: '',
//           buffer: pdfBuffer,
//           stream: Readable.from(pdfBuffer),
//         } as unknown as Express.Multer.File;

//         const uploadedUrl = await fileService.uploadFile(
//           fakeFile,
//           userIdForUpload,
//           'label',
//           'label',
//         );
//         results.push({
//           pageIndex: ap.pageIndex,
//           anchorText: a.text,
//           href: a.href,
//           absoluteUrl,
//           uploadedUrl,
//           fileName,
//         });
//       } catch (err) {
//         const errorMessage: string = err instanceof Error ? err.message : 'Unknown error';
//         results.push({
//           pageIndex: ap.pageIndex,
//           anchorText: a.text,
//           href: a.href,
//           absoluteUrl,
//           error: errorMessage,
//         });
//       }
//     }
//   }

//   // Build labelRows by parsing the results table to pair metadata with href
//   const labelRowsPerPage: ReadonlyArray<ReadonlyArray<LabelRowMetadata>> = await Promise.all(
//     allPagesAfterClick.map(async (pg: Page, idx: number) => {
//       const rows: ReadonlyArray<LabelRowMetadata> = await pg.evaluate((pageIndex: number) => {
//         const getDocument = (): unknown =>
//           (globalThis as unknown as { document?: unknown }).document;
//         const doc = getDocument();
//         if (!doc) return [] as ReadonlyArray<LabelRowMetadata>;
//         const queryOne = (node: unknown, selector: string): unknown => {
//           const qs = (node as { querySelector?: (s: string) => unknown }).querySelector;
//           return typeof qs === 'function' ? qs.call(node, selector) : null;
//         };
//         const queryAll = (node: unknown, selector: string): ReadonlyArray<unknown> => {
//           const qsa = (node as { querySelectorAll?: (s: string) => unknown }).querySelectorAll;
//           if (typeof qsa !== 'function') return [];
//           const result = qsa.call(node, selector) as unknown;
//           return Array.isArray(result)
//             ? (result as unknown[])
//             : Array.from(result as unknown as Iterable<unknown>);
//         };
//         const getText = (el: unknown): string => {
//           const text = (el as { textContent?: unknown }).textContent;
//           return typeof text === 'string' ? text.trim() : '';
//         };
//         const tables = queryAll(doc, 'table');
//         for (const t of tables) {
//           const headerRow = queryOne(t, 'tr');
//           const headerCells = headerRow ? queryAll(headerRow, 'th,td') : [];
//           const headers = headerCells.map(getText);
//           const hasKeyHeaders =
//             headers.some((h) => h.toUpperCase().includes('NUMERO REGISTRAZ')) &&
//             headers.some((h) => h.toUpperCase().includes('PRODOTTO'));
//           if (!hasKeyHeaders) continue;
//           const bodyRows = queryAll(t, 'tbody tr');
//           const allRows = bodyRows.length > 0 ? bodyRows : queryAll(t, 'tr').slice(1);
//           const results: Array<LabelRowMetadata> = [];
//           for (const tr of allRows) {
//             const cells = queryAll(tr, 'th,td');
//             if (cells.length === 0) continue;
//             const anchor = queryOne(tr, "a[href*='EtichettaServlet']");
//             if (!anchor) continue;
//             const hrefGetter = (anchor as { getAttribute?: (a: string) => unknown }).getAttribute;
//             const href =
//               typeof hrefGetter === 'function' ? (hrefGetter.call(anchor, 'href') as string) : '';
//             const anchorText = getText(anchor);
//             const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
//             const findIndex = (label: string): number =>
//               headers.findIndex((h) => h.toUpperCase().includes(label));
//             const idxNum = findIndex('NUMERO REGISTRAZ');
//             const idxProduct = findIndex('PRODOTTO');
//             const idxRegDate = findIndex('DATA REGISTRAZ');
//             const idxExpDate = findIndex('SCADENZA AUTORIZ');
//             const registrationNumber = idxNum >= 0 ? normalize(getText(cells[idxNum])) : '';
//             const productName = idxProduct >= 0 ? normalize(getText(cells[idxProduct])) : '';
//             const registrationDate =
//               idxRegDate >= 0 ? normalize(getText(cells[idxRegDate])) : undefined;
//             const authorizationExpiryDate =
//               idxExpDate >= 0 ? normalize(getText(cells[idxExpDate])) : undefined;
//             results.push({
//               pageIndex,
//               registrationNumber,
//               productName,
//               registrationDate,
//               authorizationExpiryDate,
//               href,
//               anchorText,
//             });
//           }
//           return results as ReadonlyArray<LabelRowMetadata>;
//         }
//         return [] as ReadonlyArray<LabelRowMetadata>;
//       }, idx);
//       return rows;
//     }),
//   );
//   const keepOpenMs: number = Number(effectiveOptions.keepOpenMs ?? 0);
//   if (keepOpenMs > 0) {
//     await new Promise<void>((resolve) => setTimeout(resolve, keepOpenMs));
//   }
//   const labelRows: ReadonlyArray<LabelRowMetadata> = labelRowsPerPage.flat();
//   const hrefToLabel = new Map<string, (typeof results)[number]>();
//   for (const l of results) hrefToLabel.set(l.href, l);
//   const items: ReadonlyArray<EnrichedLabelItem> = labelRows
//     .map((row) => {
//       const linked = hrefToLabel.get(row.href);
//       const absoluteUrl =
//         linked?.absoluteUrl || new URL(row.href, new URL(FITOSANITARI_URL)).toString();
//       return {
//         pageIndex: row.pageIndex,
//         productName: row.productName,
//         registrationNumber: row.registrationNumber,
//         registrationDate: row.registrationDate,
//         authorizationExpiryDate: row.authorizationExpiryDate,
//         href: row.href,
//         anchorText: row.anchorText,
//         absoluteUrl,
//         uploadedUrl: linked?.uploadedUrl,
//         fileName: linked?.fileName,
//       } as EnrichedLabelItem;
//     })
//     .filter((it) => it.productName.length > 0 || it.registrationNumber.length > 0);
//   return { windows: windowsInfo, tablesByPage, labels: results, labelRows, items };
// } finally {
//   await browser.close();
// }
// }
