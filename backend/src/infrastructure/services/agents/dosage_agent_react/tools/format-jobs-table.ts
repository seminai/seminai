/**
 * Pure helper: renders the `jobsByUnit` map returned by `fillTheJob` as a
 * markdown table the assistant can include in its final chat message.
 *
 * The user can copy-paste the rendered markdown into a spreadsheet (e.g. Numbers,
 * Excel, Google Sheets) — pipe-delimited tables paste as rows by default.
 */
import type { UnitScheduledJob } from '../../dosage_agent/flowMatchCropTreatment';

export interface UnitMeta {
  readonly unitProductionId: string;
  readonly name?: string | null;
  readonly cropName?: string | null;
  readonly variety?: string | null;
}

export interface FormatJobsTableInput {
  readonly jobsByUnit: ReadonlyMap<string, ReadonlyArray<UnitScheduledJob>>;
  readonly unitMetaById?: ReadonlyMap<string, UnitMeta>;
  readonly groupId?: string | null;
}

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return '-';
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatNumber(value: number | null | undefined, fractionDigits = 2): string {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

function pipeEscape(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function formatJobsTableMarkdown(input: FormatJobsTableInput): string {
  const rows: string[] = [];
  rows.push(
    '| # | UP | Coltura | Prodotto | Dose prodotto | Volume miscela | Superficie (ha) | Data | Avversità |',
  );
  rows.push(
    '|---|----|---------|----------|---------------|----------------|-----------------|------|-----------|',
  );

  let index = 0;
  const sortedUnitIds = Array.from(input.jobsByUnit.keys()).sort();
  const fallbackUnitLabels = new Map<string, string>();
  for (const unitId of sortedUnitIds) {
    const jobs = input.jobsByUnit.get(unitId) ?? [];
    const meta = input.unitMetaById?.get(unitId);
    if (!fallbackUnitLabels.has(unitId)) {
      fallbackUnitLabels.set(unitId, `Unità produttiva ${fallbackUnitLabels.size + 1}`);
    }
    const unitLabel = meta?.name?.trim() || fallbackUnitLabels.get(unitId)!;
    const cropLabel = [meta?.cropName, meta?.variety].filter(Boolean).join(' / ') || '-';
    const orderedJobs = [...jobs].sort(
      (a, b) => new Date(a.dateOfOpeation).getTime() - new Date(b.dateOfOpeation).getTime(),
    );
    for (const job of orderedJobs) {
      index += 1;
      const productName = job.stocks[0]?.product.name ?? '-';
      const doseProduct =
        job.productQuantityTreated != null
          ? `${formatNumber(job.productQuantityTreated)} ${job.unitOfMeasureProductQuantityTreated ?? ''}`.trim()
          : '-';
      const mixture = `${formatNumber(job.quantity)} ${job.unitOfMeasureQuantity ?? ''}`.trim();
      const surface = formatNumber(job.treatedSurface, 4);
      const date = formatDate(job.dateOfOpeation);
      rows.push(
        `| ${index} | ${pipeEscape(unitLabel)} | ${pipeEscape(cropLabel)} | ${pipeEscape(productName)} | ${pipeEscape(doseProduct)} | ${pipeEscape(mixture)} | ${surface} | ${date} | ${pipeEscape(job.avversity)} |`,
      );
    }
  }

  const lines: string[] = [];
  if (input.groupId) {
    lines.push('**Gruppo trattamenti:** creato in Archivio');
    lines.push('**Stato:** in attesa di validazione in Archivio');
    lines.push('');
  }
  lines.push(...rows);
  return lines.join('\n');
}
