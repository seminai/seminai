/**
 * Utility functions for ImageLine QuadernoDiCampagna (QDC) API
 */

import { parseTableToRecords } from './operazioni-parsers';
import { QdcImageLineRestApi } from './rest_api';
import type {
  QdcAziendaRow,
  QdcCellValue,
  QdcGiacenzaAgrofarmaco,
  QdcGiacenzaFertilizzante,
} from './types';

/**
 * Format date to Italian format (dd/mm/yyyy)
 * @param date Date object or ISO string
 */
export function formatDateIT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get today's date in Italian format
 */
export function getTodayIT(): string {
  return formatDateIT(new Date());
}

/**
 * Parse Italian date format to Date object
 * @param dateIT Date string in dd/mm/yyyy format
 */
export function parseDateIT(dateIT: string): Date {
  const [day, month, year] = dateIT.split('/').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Find company ID by VAT number (Partita IVA)
 * @param api Configured QDC API instance
 * @param vatNumber VAT number to search
 * @returns Company ID or null if not found
 */
export async function getCompanyIdByVatNumber(
  api: QdcImageLineRestApi,
  vatNumber: string,
): Promise<number | null> {
  const companies = await getAllCompanies(api);
  const company = companies.find((row) => row.piva.trim() === vatNumber.trim());
  return company?.id ?? null;
}

/**
 * Find company ID by name (exact match first, then partial)
 * @param api Configured QDC API instance
 * @param name Company name to search
 * @returns Company ID or null if not found
 */
export async function getCompanyIdByName(
  api: QdcImageLineRestApi,
  name: string,
): Promise<number | null> {
  const companies = await getAllCompanies(api);
  const normalizedSearch = name.toLowerCase().trim();
  const exact = companies.find((row) => row.azienda.toLowerCase().trim() === normalizedSearch);
  if (exact) {
    return exact.id;
  }
  const partial = companies.find((row) => row.azienda.toLowerCase().includes(normalizedSearch));
  return partial?.id ?? null;
}

/**
 * Get all companies as structured objects. Cells are resolved by column name
 * (the recordset column set varies: e.g. DISABILITATA is absent when disabled
 * companies are filtered out server-side).
 * @param api Configured QDC API instance
 * @param includeDisabled Include disabled companies
 */
export async function getAllCompanies(
  api: QdcImageLineRestApi,
  includeDisabled: boolean = false,
): Promise<QdcAziendaRow[]> {
  const response = await api.licenza.getLicenzaAziende({ mostraDisabilitate: includeDisabled });
  return parseTableToRecords(response.result).map((record) => ({
    id: Number(record.ID),
    azienda: String(record.AZIENDA ?? ''),
    piva: String(record.PIVA ?? ''),
    cf: String(record.CF ?? ''),
    validaDa: String(record.VALIDADA ?? ''),
    validaA: String(record.VALIDAA ?? ''),
    disabilitata: parseDisabilitata(record.DISABILITATA ?? null),
  }));
}

function parseDisabilitata(value: QdcCellValue): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return false;
}

/**
 * Parse agrofarmaci stock data to structured objects
 * @param data Raw API response data
 */
export function parseGiacenzeAgrofarmaci(
  data: (string | number | boolean | null)[][],
): QdcGiacenzaAgrofarmaco[] {
  // Columns: PRODOTTO, NUMREG, SETTORE, QTA, UDM
  return data.map((row) => ({
    prodotto: String(row[0]),
    numreg: Number(row[1]),
    settore: String(row[2]),
    qta: Number(row[3]),
    udm: String(row[4]),
  }));
}

/**
 * Parse fertilizer stock data to structured objects
 * @param data Raw API response data
 */
export function parseGiacenzeFertilizzanti(
  data: (string | number | boolean | null)[][],
): QdcGiacenzaFertilizzante[] {
  return data.map((row) => ({
    prodotto: String(row[0]),
    idAbilitato: Number(row[1]),
    settore: String(row[2]),
    qta: Number(row[3]),
    udm: String(row[4]),
  }));
}

/**
 * Pad registration number to 6 digits
 * @param numreg Registration number
 */
export function padNumreg(numreg: number | string): string {
  return String(numreg).padStart(6, '0');
}

/**
 * Validate unit of measure for agrofarmaci
 */
export function isValidAgrofamacoUdm(udm: string): udm is 'KG' | 'L' | 'N' {
  return ['KG', 'L', 'N'].includes(udm.toUpperCase());
}

/**
 * Validate unit of measure for fertilizzanti
 */
export function isValidFertilizzanteUdm(udm: string): udm is 'KG' | 'L' | 'MC' | 'N' {
  return ['KG', 'L', 'MC', 'N'].includes(udm.toUpperCase());
}

/**
 * Calculate date range for history queries (max 365 days)
 * @param daysBack Number of days to go back (max 365)
 */
export function getHistoryDateRange(daysBack: number = 365): { dataDa: string; dataA: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - Math.min(daysBack, 365));

  return {
    dataDa: formatDateIT(from),
    dataA: formatDateIT(today),
  };
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelayMs Base delay in milliseconds
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
