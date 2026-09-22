import { Label, LabelDoseDetail } from '../../domain/dtos/label.dto';

export interface CsvRow {
  productName: string;
  registrationNumber: string;
  coltura: string;
  malattia: string | null;
  dose_minima: number | null;
  dose_massima: number | null;
  dose_um: string | null;
  acqua_max: number | null;
  acqua_max_um: string | null;
  epoca_impiego: string | null;
  n_max_applicazioni: number | null;
  n_max_applicazioni_um: string | null;
  intervallo_min_giorni: number | null;
  modalita_applicazione: string | null;
  intervallo_sicurezza_giorni: number | null;
  istruzioni: string | null;
}

export function buildCsvHeader(): string {
  const headers: ReadonlyArray<keyof CsvRow> = [
    'productName',
    'registrationNumber',
    'coltura',
    'malattia',
    'dose_minima',
    'dose_massima',
    'dose_um',
    'acqua_max',
    'acqua_max_um',
    'epoca_impiego',
    'n_max_applicazioni',
    'n_max_applicazioni_um',
    'intervallo_min_giorni',
    'modalita_applicazione',
    'intervallo_sicurezza_giorni',
    'istruzioni',
  ];
  return headers.join(',');
}

export function escapeCsv(value: unknown): string {
  const text: string = value == null ? '' : String(value);
  if (text === '') return '';
  const needsQuotes = /[",\n]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsvRows(params: {
  productName: string;
  registrationNumber: string;
  label: Label;
}): CsvRow[] {
  const { productName, registrationNumber, label } = params;
  const details: ReadonlyArray<LabelDoseDetail> = Array.isArray(label?.dosaggi_dettagliati)
    ? label.dosaggi_dettagliati
    : [];
  if (details.length === 0) {
    return [
      {
        productName,
        registrationNumber,
        coltura: '',
        malattia: null,
        dose_minima: null,
        dose_massima: null,
        dose_um: null,
        acqua_max: null,
        acqua_max_um: null,
        epoca_impiego: null,
        n_max_applicazioni: null,
        n_max_applicazioni_um: null,
        intervallo_min_giorni: null,
        modalita_applicazione: null,
        intervallo_sicurezza_giorni: null,
        istruzioni: null,
      },
    ];
  }
  return details.map((d) => ({
    productName,
    registrationNumber,
    coltura: d.coltura ?? '',
    malattia: d.malattia ?? null,
    dose_minima: d.dose_minima ?? null,
    dose_massima: d.dose_massima ?? null,
    dose_um: d.dose_um ?? null,
    acqua_max: d.acqua_max ?? null,
    acqua_max_um: d.acqua_max_um ?? null,
    epoca_impiego: d.epoca_impiego ?? null,
    n_max_applicazioni: d.n_max_applicazioni ?? null,
    n_max_applicazioni_um: d.n_max_applicazioni_um ?? null,
    intervallo_min_giorni: d.intervallo_min_giorni ?? null,
    modalita_applicazione: d.modalita_applicazione ?? null,
    intervallo_sicurezza_giorni: d.intervallo_sicurezza_giorni ?? null,
    istruzioni: d.istruzioni ?? null,
  }));
}

export function serializeCsv(rows: CsvRow[]): string {
  const header = buildCsvHeader();
  const body = rows
    .map((r) =>
      [
        escapeCsv(r.productName),
        escapeCsv(r.registrationNumber),
        escapeCsv(r.coltura),
        escapeCsv(r.malattia),
        escapeCsv(r.dose_minima),
        escapeCsv(r.dose_massima),
        escapeCsv(r.dose_um),
        escapeCsv(r.acqua_max),
        escapeCsv(r.acqua_max_um),
        escapeCsv(r.epoca_impiego),
        escapeCsv(r.n_max_applicazioni),
        escapeCsv(r.n_max_applicazioni_um),
        escapeCsv(r.intervallo_min_giorni),
        escapeCsv(r.modalita_applicazione),
        escapeCsv(r.intervallo_sicurezza_giorni),
        escapeCsv(r.istruzioni),
      ].join(','),
    )
    .join('\n');
  return `${header}\n${body}`;
}
