import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  checkProductRevoked,
  checkProductsBatchRevoked,
  isRevokedDatasetAvailable,
} from '../../dosage_agent/revokedProductChecker';

/**
 * Tool: check_product_revoked
 * Verifies if one or more products have been revoked by the Italian Ministry of Health.
 */
export function createCheckRevokedTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'check_product_revoked',
    description: `Verifica se uno o più prodotti fitosanitari sono stati revocati dal Ministero della Salute italiano.
Usa questo strumento PRIMA di procedere con qualsiasi calcolo di dosaggio.
Accetta un singolo prodotto (registrationNumber) o una lista di prodotti (products).
Restituisce lo stato di revoca, la data e il motivo per ogni prodotto.`,
    schema: z.object({
      registrationNumber: z
        .string()
        .optional()
        .describe('Numero di registrazione del prodotto singolo (es. "3872")'),
      productName: z
        .string()
        .optional()
        .describe('Nome del prodotto singolo (opzionale, per conferma)'),
      products: z
        .array(
          z.object({
            regNumber: z.string().describe('Numero di registrazione'),
            name: z.string().optional().describe('Nome prodotto'),
          }),
        )
        .optional()
        .describe('Lista di prodotti da verificare in batch'),
    }),
    func: async ({ registrationNumber, productName, products }) => {
      try {
        const datasetStatus = isRevokedDatasetAvailable();
        if (!datasetStatus.available) {
          return JSON.stringify({
            warning: 'Dataset prodotti revocati non disponibile',
            error: datasetStatus.error,
            recommendation: 'Procedere con cautela, verificare manualmente.',
          });
        }

        // Batch mode
        if (products && products.length > 0) {
          const results = checkProductsBatchRevoked(products);
          const output: Array<{ readonly status: 'REVOCATO' | 'ATTIVO'; readonly [key: string]: unknown }> = [];
          for (const [key, result] of results) {
            output.push({
              key,
              status: result.isRevoked ? 'REVOCATO' : 'ATTIVO',
              ...(result.info
                ? {
                    productName: result.info.productName,
                    regNumber: result.info.regNumber,
                    revokeDate: result.info.revokeDate,
                    revokeReason: result.info.revokeReason,
                  }
                : {}),
            });
          }
          const revokedCount = output.filter((item) => item.status === 'REVOCATO').length;
          return JSON.stringify({
            totalChecked: products.length,
            revokedCount,
            results: output,
            recommendation:
              revokedCount > 0
                ? 'Alcuni prodotti sono revocati. NON utilizzarli. Suggerire alternative.'
                : 'Tutti i prodotti sono attivi e utilizzabili.',
          });
        }

        // Single product mode
        const result = checkProductRevoked(registrationNumber, productName);
        if (result.isRevoked) {
          return JSON.stringify({
            status: 'REVOCATO',
            productName: result.info?.productName ?? productName,
            registrationNumber: registrationNumber ?? 'N/A',
            revokeDate: result.info?.revokeDate,
            revokeReason: result.info?.revokeReason,
            recommendation:
              'Questo prodotto è stato REVOCATO e NON deve essere utilizzato. Suggerire un prodotto alternativo con lo stesso principio attivo.',
          });
        }

        return JSON.stringify({
          status: 'ATTIVO',
          registrationNumber: registrationNumber ?? 'N/A',
          productName: productName ?? 'N/A',
          message: 'Prodotto attivo e utilizzabile.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({
          error: msg,
          recommendation: 'Verificare manualmente il prodotto.',
        });
      }
    },
  });
}
