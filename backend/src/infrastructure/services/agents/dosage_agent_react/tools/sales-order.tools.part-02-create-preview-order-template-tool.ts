import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { buildImportTemplateUseCase, errorPayload, readCommercialSource, readUploadedTemplate, toPreviewPayload } from './sales-order.tools.part-01-error-payload';

/**
 * Tool: preview_order_template — parses the attached order template and shows a
 * normalized, resolved preview. Read-only (no persistence).
 */
export function createPreviewOrderTemplateTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'preview_order_template',
    description: `Legge il MODELLO ordine Excel allegato (colonne fisse: Prodotto | Annata | Quantità | Prezzo unitario, più "Nome cliente" e "P.IVA") e mostra un'anteprima normalizzata.
NON crea nulla: abbina cliente e prodotti all'anagrafica e indica se l'ordine è creabile (canCreate).
Usa SEMPRE questo strumento prima di import_sales_order_from_template, e mostra l'anteprima all'utente.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda venditrice'),
    }),
    func: async ({ companyId }) => {
      try {
        const file = readUploadedTemplate(threadId);
        if (!file) {
          return JSON.stringify({
            error: 'Nessun file caricato.',
            hint: "L'utente deve allegare il modello ordine .xlsx.",
          });
        }
        const preview = await buildImportTemplateUseCase().preview({
          fileBuffer: file.buffer,
          fileName: file.fileName,
          companyId,
          sourceChannel: 'chat',
        });
        return JSON.stringify(toPreviewPayload(preview));
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: import_sales_order_from_template — creates a DRAFT order from the attached
 * template once customer + products resolve. REQUIRES APPROVAL.
 */
export function createImportSalesOrderFromTemplateTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'import_sales_order_from_template',
    description: `Crea un ordine cliente in BOZZA a partire dal MODELLO Excel allegato.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Abbina cliente e prodotti all'anagrafica. Se il cliente non è in anagrafica usa search_business_partners / create_business_partner, poi richiama questo strumento passando partnerId.
Se cliente o prodotti non sono risolti, restituisce l'anteprima senza creare nulla.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda venditrice'),
      partnerId: z.string().optional().nullable().describe('ID cliente già risolto (opzionale)'),
    }),
    func: async ({ companyId, partnerId }) => {
      try {
        const file = readUploadedTemplate(threadId);
        if (!file) {
          return JSON.stringify({ error: 'Nessun file caricato.' });
        }
        const useCase = buildImportTemplateUseCase();
        const preview = await useCase.preview({
          fileBuffer: file.buffer,
          fileName: file.fileName,
          companyId,
          sourceChannel: 'chat',
        });
        const resolvedPartnerId = partnerId ?? preview.partner.matchedId ?? undefined;
        const linesCreatable =
          preview.lines.length > 0 &&
          preview.lines.every(
            (line) => line.matchedProductId && !line.warnings.includes('PRODUCT_INACTIVE'),
          );
        if (!linesCreatable) {
          return JSON.stringify({
            created: false,
            ...toPreviewPayload(preview),
            message: 'Anteprima pronta — risolvi i prodotti mancanti prima di creare.',
          });
        }
        const source = readCommercialSource(threadId);
        const result = await useCase.commit({
          companyId,
          partnerId: resolvedPartnerId,
          customerName: preview.standardOrder.customerName,
          customerVat: preview.standardOrder.customerVat,
          lines: preview.lines,
          deliveryNotesText: preview.standardOrder.deliveryNotesText,
          sourceChannel: source.channel,
          sourceRef: source.ref,
        });
        return JSON.stringify({
          created: true,
          orderId: result.order.order.id,
          status: result.order.order.status,
          lines: result.order.items.length,
          totals: result.totals,
          message: `Ordine importato (bozza) con ${result.order.items.length} righe. Totale € ${result.totals.total.toFixed(2)}.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}
