/* eslint-disable no-process-env */
import fs from 'fs';
import axios, { type AxiosResponse } from 'axios';
import FormData from 'form-data';

const DATALAB_API_KEY: string = process.env['DATALAB_API_KEY'] ?? '';
const DATALAB_API_URL: string = 'https://www.datalab.to/api/v1/marker';
const MAX_POLLS: number = 300;
const POLL_INTERVAL_MS: number = 2000;

interface InitialResponseBody {
  success: boolean;
  error: string | null;
  request_id: string;
  request_check_url: string;
}

interface PollResponseBody {
  output_format?: string | null;
  markdown?: string | null;
  html?: string | null;
  status?: 'complete' | 'processing' | null;
  success?: boolean | null;
  images?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
  page_count?: number | null;
}

function getContentType(filePath: string): string {
  const extension: string = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'tiff':
    case 'tif':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Execute OCR and layout understanding via Datalab using a direct URL and return Markdown.
 *
 * Requirements:
 * - Env var `DATALAB_API_KEY` must be set
 * - `pdfUrl` must be a valid URL pointing to a PDF file
 *
 * The function performs a two-step flow:
 * 1) Sends the URL to Datalab to obtain a `request_check_url`
 * 2) Polls the `request_check_url` until the job is complete, then returns Markdown
 */
export async function extractMarkdownFromUrl(pdfUrl: string, maxPages?: number): Promise<string> {
  if (!DATALAB_API_KEY) {
    throw new Error('DATALAB_API_KEY is not set');
  }

  if (!pdfUrl || pdfUrl.trim().length === 0) {
    throw new Error('PDF URL is required');
  }

  // Verifica che l'URL sia valido
  try {
    new URL(pdfUrl);
  } catch {
    throw new Error(`Invalid PDF URL: ${pdfUrl}`);
  }

  const formData = new FormData();
  formData.append('file_url', pdfUrl);
  formData.append('langs', 'ita');
  formData.append('force_ocr', 'true');
  formData.append('paginate', 'false');
  formData.append('output_format', 'markdown');
  formData.append('use_llm', 'true');
  formData.append('strip_existing_ocr', 'false');
  formData.append('disable_image_extraction', 'true');

  // Aggiungi limite pagine se specificato
  if (maxPages && maxPages > 0) {
    formData.append('max_pages', maxPages.toString());
  }

  console.log(`[Datalab] Processing URL: ${pdfUrl}`);
  console.log(`[Datalab] FormData parameters:`, {
    file_url: pdfUrl,
    langs: 'ita',
    force_ocr: 'true',
    paginate: 'false',
    output_format: 'markdown',
    use_llm: 'true',
    strip_existing_ocr: 'false',
    disable_image_extraction: 'true',
    ...(maxPages && { max_pages: maxPages.toString() }),
  });

  const initialResponse: AxiosResponse<InitialResponseBody> = await axios.post(
    DATALAB_API_URL,
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        'X-Api-Key': DATALAB_API_KEY,
      },
      timeout: 120000,
    },
  );

  if (!initialResponse.data?.success) {
    const reason: string = initialResponse.data?.error ?? 'Unknown error';
    console.error(`[Datalab] Initial request failed:`, {
      status: initialResponse.status,
      statusText: initialResponse.statusText,
      data: initialResponse.data,
      headers: initialResponse.headers,
    });
    throw new Error(`Datalab initialization failed: ${reason}`);
  }

  const checkUrl: string = initialResponse.data.request_check_url;
  console.log(`[Datalab] Request ID: ${initialResponse.data.request_id}`);

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollResponse: AxiosResponse<PollResponseBody> = await axios.get(checkUrl, {
      headers: { 'X-Api-Key': DATALAB_API_KEY },
      timeout: 60000,
    });

    const body: PollResponseBody | undefined = pollResponse.data;
    if (!body) {
      continue;
    }

    if (body.status === 'complete') {
      if (body.success === false) {
        const reason: string = body.error ?? 'Processing failed';
        throw new Error(`Datalab processing failed: ${reason}`);
      }
      const markdown: string | null | undefined = body.markdown;
      if (!markdown || markdown.trim().length === 0) {
        throw new Error('Datalab returned no markdown');
      }
      console.log(`[Datalab] Successfully extracted ${markdown.length} characters`);
      return markdown;
    }

    if (attempt % 10 === 0) {
      console.log(`[Datalab] Still processing... (attempt ${attempt + 1}/${MAX_POLLS})`);
    }
  }

  const waitedSeconds: number = Math.floor((MAX_POLLS * POLL_INTERVAL_MS) / 1000);
  throw new Error(`Datalab processing timeout after ${waitedSeconds} seconds`);
}

/**
 * Execute OCR and layout understanding via Datalab and return Markdown.
 *
 * Requirements:
 * - Env var `DATALAB_API_KEY` must be set
 * - `filePath` must point to a readable PDF or image file
 *
 * The function performs a two-step flow:
 * 1) Uploads the file to Datalab to obtain a `request_check_url`
 * 2) Polls the `request_check_url` until the job is complete, then returns Markdown
 */
export async function extractMarkdownWithDatalab(filePath: string): Promise<string> {
  if (!DATALAB_API_KEY) {
    throw new Error('DATALAB_API_KEY is not set');
  }

  const fileExists: boolean = fs.existsSync(filePath);
  if (!fileExists) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const formData = new FormData();
  const fileName: string = filePath.split('/').pop() ?? 'document';
  formData.append('file', fs.createReadStream(filePath), {
    filename: fileName,
    contentType: getContentType(filePath),
  });
  formData.append('langs', 'ita');
  formData.append('force_ocr', 'true');
  formData.append('paginate', 'false');
  formData.append('output_format', 'markdown');
  formData.append('use_llm', 'true');
  formData.append('strip_existing_ocr', 'false');
  formData.append('disable_image_extraction', 'true');

  const initialResponse: AxiosResponse<InitialResponseBody> = await axios.post(
    DATALAB_API_URL,
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        'X-Api-Key': DATALAB_API_KEY,
      },
      timeout: 120000,
    },
  );

  if (!initialResponse.data?.success) {
    const reason: string = initialResponse.data?.error ?? 'Unknown error';
    console.error(`[Datalab] Initial request failed:`, {
      status: initialResponse.status,
      statusText: initialResponse.statusText,
      data: initialResponse.data,
      headers: initialResponse.headers,
    });
    throw new Error(`Datalab initialization failed: ${reason}`);
  }

  const checkUrl: string = initialResponse.data.request_check_url;

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollResponse: AxiosResponse<PollResponseBody> = await axios.get(checkUrl, {
      headers: { 'X-Api-Key': DATALAB_API_KEY },
      timeout: 60000,
    });

    const body: PollResponseBody | undefined = pollResponse.data;
    if (!body) {
      continue;
    }

    if (body.status === 'complete') {
      if (body.success === false) {
        const reason: string = body.error ?? 'Processing failed';
        throw new Error(`Datalab processing failed: ${reason}`);
      }
      const markdown: string | null | undefined = body.markdown;
      if (!markdown || markdown.trim().length === 0) {
        throw new Error('Datalab returned no markdown');
      }
      return markdown;
    }
  }

  const waitedSeconds: number = Math.floor((MAX_POLLS * POLL_INTERVAL_MS) / 1000);
  throw new Error(`Datalab processing timeout after ${waitedSeconds} seconds`);
}
