import fs from 'fs';
import path from 'path';
import os from 'os';
import { PDFExtract, type PDFExtractOptions } from 'pdf.js-extract';

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfRow = {
  y: number;
  items: PdfTextItem[];
};

type PDFExtractPage = {
  content: PdfTextItem[];
};

type PDFExtractResult = {
  pages: PDFExtractPage[];
};

/**
 * Converts a PDF file to plain text using pdf-parse library.
 * Uses dynamic import to properly load polyfills in Node.js environment.
 * @param pdfPath - The path to the PDF file to convert
 * @returns An object containing the output file path and extracted text
 */
export async function convertPdfToText(pdfPath: string): Promise<{ path: string; text: string }> {
  const { PDFParse } = await import('pdf-parse');
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
  try {
    const result = await parser.getText();
    const outputPath = pdfPath.replace(/\.pdf$/i, '.txt');
    fs.writeFileSync(outputPath, result.text);
    return { path: outputPath, text: result.text };
  } finally {
    await parser.destroy();
  }
}

/**
 * @deprecated Use `convertPdfToFlatText` instead.
 *
 * Reconstructs text from PDF with positional awareness to preserve layout and
 * columns. This heuristic is the historical root cause of the "quantity in the
 * wrong column" bug: it assigns each token to the nearest column centre, but
 * irregular table layouts (merged cells, wrapping descriptions, quantity and
 * unit on the same x) produce off-by-one shifts.
 *
 * The class is kept behind `convertPdfToTextWithPositionalAnaylsis` for any
 * legacy caller, but the new invoice/DDT pipeline relies on markdown tables
 * emitted by OCR (Mistral / GPT Vision) plus the flat-text fallback.
 */
class PositionalTextReconstructor {
  private readonly yStart: number;
  private readonly yTolerance: number;
  private readonly xTolerance: number;
  private readonly minColumnGap: number;

  constructor(params?: {
    yStart?: number;
    yTolerance?: number;
    xTolerance?: number;
    minColumnGap?: number;
  }) {
    this.yStart = params?.yStart ?? Number.parseInt(process.env['PDF_TEXT_Y_START'] ?? '100', 10);
    this.yTolerance =
      params?.yTolerance ?? Number.parseInt(process.env['PDF_TEXT_Y_TOLERANCE'] ?? '6', 10);
    this.xTolerance =
      params?.xTolerance ?? Number.parseInt(process.env['PDF_TEXT_X_TOLERANCE'] ?? '8', 10);
    this.minColumnGap =
      params?.minColumnGap ?? Number.parseInt(process.env['PDF_TEXT_MIN_COL_GAP'] ?? '24', 10);
  }

  public reconstructPage(items: PdfTextItem[]): string {
    const filtered = items.filter((i) => i.str && i.str.trim() && i.y >= this.yStart);
    const rows = this.groupItemsByRows(filtered);
    const columnCenters = this.inferColumnCenters(rows);
    const lines = rows.map((row) => this.reconstructRow(row, columnCenters));
    return lines.join('\n');
  }

  private groupItemsByRows(items: PdfTextItem[]): PdfRow[] {
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: PdfRow[] = [];
    for (const item of items) {
      let row = rows.find((r) => Math.abs(r.y - item.y) < this.yTolerance);
      if (!row) {
        row = { y: item.y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    }
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
    }
    return rows;
  }

  private inferColumnCenters(rows: PdfRow[]): number[] {
    const xs: number[] = [];
    for (const row of rows) {
      for (const it of row.items) {
        xs.push(Math.round(it.x));
      }
    }
    xs.sort((a, b) => a - b);
    const centers: number[] = [];
    for (const x of xs) {
      if (centers.length === 0) {
        centers.push(x);
        continue;
      }
      const last = centers[centers.length - 1];
      if (Math.abs(x - last) <= this.xTolerance) {
        centers[centers.length - 1] = Math.round((last + x) / 2);
      } else if (x - last >= this.minColumnGap) {
        centers.push(x);
      } else {
        centers[centers.length - 1] = Math.round((last + x) / 2);
      }
    }
    return centers;
  }

  private reconstructRow(row: PdfRow, centers: number[]): string {
    if (centers.length === 0) {
      return row.items.map((i) => i.str).join(' ');
    }
    const columns: string[][] = Array.from({ length: centers.length }, () => []);
    for (const it of row.items) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c += 1) {
        const dist = Math.abs(it.x - centers[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
        }
      }
      columns[bestIdx].push(it.str);
    }
    const normalized = columns.map((col) => col.join(' ').trim());
    return normalized.join(' | ');
  }
}

/**
 * Reads a PDF with pdf.js-extract but joins the tokens in reading order without
 * attempting to infer column centres. This is the preferred source for header/
 * footer metadata (supplier, invoice number, dates). Tabular data should come
 * from a proper OCR (Mistral markdown / GPT Vision), not from positional text.
 */
export async function convertPdfToFlatText(
  pdfPath: string,
): Promise<{ path: string; text: string; pageCount: number }> {
  const pdfExtract = new PDFExtract();
  const options: PDFExtractOptions = {
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  };
  const data = await new Promise<PDFExtractResult>((resolve, reject) => {
    pdfExtract.extract(pdfPath, options, (err, extractedData) => {
      if (err) reject(err);
      else resolve(extractedData as PDFExtractResult);
    });
  });
  const pageTexts = data.pages.map((page) => {
    const tokens = page.content.filter((item) => item.str && item.str.trim().length > 0);
    tokens.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: string[] = [];
    let currentY: number | null = null;
    let currentLine: string[] = [];
    const yTolerance = 4;
    for (const token of tokens) {
      if (currentY === null || Math.abs(token.y - currentY) > yTolerance) {
        if (currentLine.length > 0) lines.push(currentLine.join(' '));
        currentLine = [token.str.trim()];
        currentY = token.y;
      } else {
        currentLine.push(token.str.trim());
      }
    }
    if (currentLine.length > 0) lines.push(currentLine.join(' '));
    return lines.join('\n');
  });
  const text = pageTexts.join('\n\n--- Page Break ---\n\n');
  const outputPath = pdfPath.replace(/\.pdf$/i, '.flat.txt');
  fs.writeFileSync(outputPath, text);
  return { path: outputPath, text, pageCount: data.pages.length };
}

/**
 * @deprecated Prefer `convertPdfToFlatText` plus an OCR pass with markdown
 * tables. The positional column reconstruction behind this function frequently
 * misaligns numeric columns for irregular invoice layouts.
 *
 * Converts a PDF file to text with positional analysis to preserve layout structure.
 * This function uses pdf.js-extract to maintain text positioning and column detection.
 * @param pdfPath - The path to the PDF file to convert
 * @returns An object containing the output file path and extracted text with preserved layout
 */
export async function convertPdfToTextWithPositionalAnaylsis(
  pdfPath: string,
): Promise<{ path: string; text: string; pageCount: number }> {
  const startTime = Date.now();
  const pdfExtract = new PDFExtract();
  const options: PDFExtractOptions = {
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  };
  const data = await new Promise<PDFExtractResult>((resolve, reject) => {
    pdfExtract.extract(pdfPath, options, (err, extractedData) => {
      if (err) {
        reject(err);
      } else {
        resolve(extractedData as PDFExtractResult);
      }
    });
  });
  const reconstructor = new PositionalTextReconstructor();
  const pageTexts: string[] = [];
  for (const page of data.pages) {
    const items: PdfTextItem[] = [];
    for (const item of page.content) {
      if (item.str && item.str.trim()) {
        items.push({
          str: item.str.trim(),
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        });
      }
    }
    const pageText = reconstructor.reconstructPage(items);
    pageTexts.push(pageText);
  }
  const text = pageTexts.join('\n\n--- Page Break ---\n\n');
  const outputPath = pdfPath.replace(/\.pdf$/i, '.txt');
  fs.writeFileSync(outputPath, text);
  console.log(`Time taken to convert PDF to text: ${Date.now() - startTime}ms`);
  return { path: outputPath, text, pageCount: data.pages.length };
}

/**
 * Converts a PDF buffer to flat text (no column reconstruction).
 * Creates a temporary file, extracts text, then deletes the temp file.
 * @param pdfBuffer - The PDF file as a Buffer
 * @returns An object containing the extracted text and page count
 */
export async function pdfToText(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(
    tempDir,
    `pdf-extract-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`,
  );

  try {
    fs.writeFileSync(tempFilePath, new Uint8Array(pdfBuffer));
    const result = await convertPdfToFlatText(tempFilePath);
    return { text: result.text, pageCount: result.pageCount };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    const textFilePath = tempFilePath.replace(/\.pdf$/i, '.flat.txt');
    if (fs.existsSync(textFilePath)) {
      fs.unlinkSync(textFilePath);
    }
  }
}
