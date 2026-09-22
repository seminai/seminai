import { DeliveryNoteWithItems } from '../../../domain/repositories/IDeliveryNoteRepository';
import {
  computeLineNet,
  computeLineVat,
  computeSalesTotals,
} from '../../../domain/utils/sales-totals';
import {
  DocumentSeller,
  escapeHtml,
  formatAddress,
  formatCurrency,
  formatDate,
} from '../shared/document-html.helpers';

/** Minimal seller (mittente) header data for the printable DDT. */
export type DeliveryNoteSeller = DocumentSeller;

/**
 * Renders a self-contained, printable HTML document for a DDT.
 * No external libraries: the browser prints it directly (window.print / Ctrl+P).
 */
export function renderDeliveryNoteHtml(params: {
  deliveryNote: DeliveryNoteWithItems['deliveryNote'];
  items: DeliveryNoteWithItems['items'];
  seller?: DeliveryNoteSeller;
}): string {
  const { deliveryNote: ddt, items, seller } = params;
  const snapshot = ddt.customerSnapshot;
  const totals = computeSalesTotals(items);

  const rows = items
    .map((item, index) => {
      const net = computeLineNet(item);
      const vat = computeLineVat(item);
      return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(item.productName)}${item.vintage ? ` (${escapeHtml(item.vintage)})` : ''}</td>
        <td>${escapeHtml(item.sku ?? '')}</td>
        <td class="num">${escapeHtml(item.quantity)} ${escapeHtml(item.unitOfMeasure ?? '')}</td>
        <td class="num">${formatCurrency(item.unitPrice)}</td>
        <td class="num">${escapeHtml(item.discount)}%</td>
        <td class="num">${escapeHtml(item.vatRate)}%</td>
        <td class="num">${formatCurrency(net)}</td>
        <td class="num">${formatCurrency(vat)}</td>
      </tr>`;
    })
    .join('');

  const sellerBlock = seller
    ? `<div class="party">
        <h3>Mittente</h3>
        <p><strong>${escapeHtml(seller.name)}</strong></p>
        ${seller.vatNumber ? `<p>P.IVA: ${escapeHtml(seller.vatNumber)}</p>` : ''}
        ${seller.address ? `<p>${escapeHtml(formatAddress({ address: seller.address, city: seller.city ?? null, cap: seller.cap ?? null, nation: seller.nation ?? null }))}</p>` : ''}
      </div>`
    : '';

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DDT ${escapeHtml(ddt.number)}/${escapeHtml(ddt.year)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 24px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h3 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; color: #555; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 16px; }
  .meta p { margin: 2px 0; }
  .parties { display: flex; gap: 32px; margin-bottom: 16px; }
  .party { flex: 1; }
  .party p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f2f2f2; font-size: 11px; text-transform: uppercase; }
  td.num, th.num { text-align: right; }
  .totals { margin-top: 16px; width: 280px; margin-left: auto; }
  .totals tr td { border: none; padding: 3px 8px; }
  .totals tr.total td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 15px; }
  .transport { margin-top: 16px; border: 1px solid #ccc; padding: 10px; }
  .transport span { display: inline-block; margin-right: 24px; }
  .notes { margin-top: 12px; font-style: italic; color: #444; }
  .status-cancelled { color: #b00020; font-weight: bold; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Documento di Trasporto</h1>
      <div class="meta">
        <p><strong>N. ${escapeHtml(ddt.number)}/${escapeHtml(ddt.year)}</strong></p>
        <p>Data: ${formatDate(ddt.ddtDate)}</p>
        <p>Causale: ${escapeHtml(ddt.causale ?? 'Vendita')}</p>
        ${ddt.status === 'CANCELLED' ? '<p class="status-cancelled">ANNULLATO</p>' : ''}
      </div>
    </div>
    ${sellerBlock}
  </div>

  <div class="parties">
    <div class="party">
      <h3>Destinatario</h3>
      <p><strong>${escapeHtml(snapshot.name)}</strong></p>
      ${snapshot.vatNumber ? `<p>P.IVA: ${escapeHtml(snapshot.vatNumber)}</p>` : ''}
      ${snapshot.fiscalCode ? `<p>C.F.: ${escapeHtml(snapshot.fiscalCode)}</p>` : ''}
      ${snapshot.referent ? `<p>Rif.: ${escapeHtml(snapshot.referent)}</p>` : ''}
    </div>
    <div class="party">
      <h3>Luogo di consegna</h3>
      <p>${escapeHtml(formatAddress(snapshot.deliveryAddress))}</p>
      ${snapshot.deliveryHours ? `<p>Orari: ${escapeHtml(snapshot.deliveryHours)}</p>` : ''}
      ${snapshot.deliveryNotesText ? `<p>${escapeHtml(snapshot.deliveryNotesText)}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Prodotto</th>
        <th>SKU</th>
        <th class="num">Quantità</th>
        <th class="num">Prezzo</th>
        <th class="num">Sconto</th>
        <th class="num">IVA</th>
        <th class="num">Imponibile</th>
        <th class="num">IVA €</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Imponibile</td><td class="num">${formatCurrency(totals.taxableAmount)}</td></tr>
    <tr><td>IVA</td><td class="num">${formatCurrency(totals.vatAmount)}</td></tr>
    <tr class="total"><td>Totale</td><td class="num">${formatCurrency(totals.total)}</td></tr>
  </table>

  <div class="transport">
    <span><strong>Vettore:</strong> ${escapeHtml(ddt.carrier ?? '—')}</span>
    <span><strong>Colli:</strong> ${escapeHtml(ddt.packagesCount ?? '—')}</span>
    <span><strong>Peso:</strong> ${ddt.estimatedWeightKg ? `${escapeHtml(ddt.estimatedWeightKg)} kg` : '—'}</span>
  </div>
  ${ddt.deliveryNotesText ? `<p class="notes">Note: ${escapeHtml(ddt.deliveryNotesText)}</p>` : ''}
</body>
</html>`;
}
