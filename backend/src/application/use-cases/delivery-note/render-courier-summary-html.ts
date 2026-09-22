import { ShippingSummaryDto } from '../../../domain/dtos/shipping-summary.dto';
import { escapeHtml } from '../shared/document-html.helpers';

/** Renders a self-contained HTML shipping summary email for the courier. */
export function renderCourierSummaryHtml(params: {
  companyName: string;
  summary: ShippingSummaryDto;
}): string {
  const { companyName, summary } = params;
  const rows = summary.rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.carrier ?? '—')}</td>
        <td>${escapeHtml(row.recipients.join(', '))}</td>
        <td class="num">${escapeHtml(row.ddtCount)}</td>
        <td class="num">${escapeHtml(row.packagesCount)}</td>
        <td class="num">${escapeHtml(row.estimatedWeightKg)} kg</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Riepilogo spedizioni — ${escapeHtml(companyName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 24px; font-size: 13px; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f2f2f2; font-size: 11px; text-transform: uppercase; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: bold; border-top: 2px solid #1a1a1a; }
</style>
</head>
<body>
  <h1>Riepilogo spedizioni — ${escapeHtml(companyName)}</h1>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Vettore</th>
        <th>Destinatari</th>
        <th class="num">DDT</th>
        <th class="num">Colli</th>
        <th class="num">Peso</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">Totale</td>
        <td class="num">${escapeHtml(summary.totals.ddtCount)}</td>
        <td class="num">${escapeHtml(summary.totals.packagesCount)}</td>
        <td class="num">${escapeHtml(summary.totals.estimatedWeightKg)} kg</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}
