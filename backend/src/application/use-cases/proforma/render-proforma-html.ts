import { ProformaInvoiceWithItems } from '../../../domain/repositories/IProformaInvoiceRepository';
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

export type ProformaSeller = DocumentSeller;

/**
 * Renders a self-contained, printable HTML document for a proforma invoice.
 * Non-fiscal: same layout family as the DDT minus the transport block.
 */
export function renderProformaHtml(params: {
  proformaInvoice: ProformaInvoiceWithItems['proformaInvoice'];
  items: ProformaInvoiceWithItems['items'];
  seller?: ProformaSeller;
}): string {
  const { proformaInvoice: proforma, items, seller } = params;
  const snapshot = proforma.customerSnapshot;
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
<title>Proforma ${escapeHtml(proforma.number)}/${escapeHtml(proforma.year)}</title>
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
  .notes { margin-top: 12px; font-style: italic; color: #444; }
  .disclaimer { margin-top: 16px; font-size: 11px; color: #777; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Fattura Proforma</h1>
      <div class="meta">
        <p><strong>N. ${escapeHtml(proforma.number)}/${escapeHtml(proforma.year)}</strong></p>
        <p>Data: ${formatDate(proforma.proformaDate)}</p>
        <p>Causale: ${escapeHtml(proforma.causale ?? 'Proforma')}</p>
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
      <h3>Indirizzo</h3>
      <p>${escapeHtml(formatAddress(snapshot.deliveryAddress))}</p>
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

  ${proforma.deliveryNotesText ? `<p class="notes">Note: ${escapeHtml(proforma.deliveryNotesText)}</p>` : ''}
  <p class="disclaimer">Documento non fiscale. La presente proforma non costituisce fattura ai fini IVA.</p>
</body>
</html>`;
}
