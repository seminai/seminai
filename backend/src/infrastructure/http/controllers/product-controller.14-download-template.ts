import { Request, Response } from 'express';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerDownloadTemplate(this: ProductControllerContext, _request: Request, response: Response): Promise<Response> {
    const headers = [
      // Product fields - Required
      'Nome prodotto',
      'SKU',
      // Product fields - Optional
      'Barcode',
      'Categoria',
      'Tipo',
      'Descrizione',
      'Numero registrazione',
      'URL etichetta',
      // Stock fields - Required
      'Quantità stock',
      'Unità di misura stock',
      'Codice DDT',
      'Data fattura',
      // Stock fields - Optional
      'Prezzo',
      'Unità di misura prezzo',
      'Tipo movimento',
      'Scadenza fattura',
      'Data DDT',
      'URL file DDT',
      'Codice fattura',
      'URL file fattura',
      'Nome fornitore',
      'Indirizzo fornitore',
      'Partita IVA fornitore',
    ];

    const exampleRow = [
      // Product - Required
      'Esempio Prodotto',
      'SKU-001',
      // Product - Optional
      '1234567890123',
      'FERTILIZER',
      'Generico',
      'Descrizione del prodotto',
      '12345',
      'https://example.com/label.pdf',
      // Stock - Required
      '100',
      'Kg',
      'DDT-001',
      '31/12/2024',
      // Stock - Optional
      '50.00',
      'EUR/kg',
      'IN',
      '15/01/2025',
      '30/12/2024',
      'https://example.com/ddt.pdf',
      'FATT-001',
      'https://example.com/invoice.pdf',
      'Fornitore S.r.l.',
      'Via Roma 1, 00100 Roma',
      'IT12345678901',
    ];

    const csvContent = [
      headers.join(';'),
      exampleRow.join(';'),
      '', // Empty row for user to fill
      '# Istruzioni:',
      '# - I campi obbligatori sono: Nome prodotto, SKU, Quantità stock, Unità di misura stock, Codice DDT, Data fattura',
      '# - Per i numeri decimali usa la virgola (es: 0,3 oppure 2400,5)',
      '# - Le date devono essere nel formato DD/MM/YYYY',
      '# - Le categorie disponibili sono: FERTILIZER, PESTICIDE, SEED, HARVEST, EQUIPMENT, PACKAGING',
      '# - Il tipo movimento può essere: IN (entrata) o OUT (uscita)',
      '# - Il campo Prezzo rappresenta costo acquisto se type=IN, prezzo vendita se type=OUT',
      '# - Usa il punto e virgola (;) come delimitatore per evitare problemi con i numeri decimali',
    ].join('\n');

    const filename = `template_importazione_prodotti_${new Date().toISOString().split('T')[0]}.csv`;

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf-8'));

    return response.send(csvContent);
  }
