import { SnapshotAddress } from '../../../domain/dtos/delivery-note.dto';

/** Minimal seller (mittente) header data shared by printable sales documents. */
export interface DocumentSeller {
  readonly name: string;
  readonly vatNumber?: string | null;
  readonly fiscalCode?: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly cap?: string | null;
  readonly nation?: string | null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-escapes any scalar for safe interpolation into a document template. */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Formats a number as a EUR amount, e.g. "€ 12.50". */
export function formatCurrency(value: number): string {
  return `€ ${value.toFixed(2)}`;
}

/** Formats a date as DD/MM/YYYY. */
export function formatDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${value.getFullYear()}`;
}

/** Joins a snapshot address into a single human-readable line. */
export function formatAddress(address: SnapshotAddress): string {
  const parts = [
    address.address,
    [address.cap, address.city].filter(Boolean).join(' '),
    address.nation,
  ];
  return parts.filter((part) => part && part.trim().length > 0).join(', ');
}
