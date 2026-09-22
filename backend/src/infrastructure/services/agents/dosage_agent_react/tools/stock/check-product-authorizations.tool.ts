import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  llmMatchAgronomicNames,
  llmFilterMatchingNames,
} from '../../../shared/llmAgronomicMatcher';
import {
  resolveProductCrops,
  describeSource,
  CropResolutionSource,
} from '../../../shared/resolveProductCrops';

interface ProductAuthResult {
  productName: string;
  registrationNumber: string;
  authorizedCrops: ReadonlyArray<string>;
  matchesTarget: boolean | null;
  source: CropResolutionSource;
}

/**
 * Tool: check_product_crop_authorizations
 * Resolves authorized crops via the shared waterfall:
 *   LabelExtraction DB → BDF API → on-demand SIAN/Tavily extraction → CSV dataset.
 */
export const createCheckProductCropAuthorizationsTool = (): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'check_product_crop_authorizations',
    description:
      'Verifica su quali colture i prodotti fitosanitari sono autorizzati. ' +
      'Cascade: etichetta DB → BDF API → estrazione on-demand (SIAN per fitofarmaci, Tavily per fertilizzanti) → dataset BDF locale. ' +
      'Accetta una lista di prodotti (nome + numero registrazione) e una coltura target opzionale.',
    schema: z.object({
      products: z
        .array(
          z.object({
            productName: z.string().describe('Nome commerciale del prodotto'),
            registrationNumber: z
              .string()
              .optional()
              .default('')
              .describe('Numero di registrazione ministeriale'),
          }),
        )
        .min(1)
        .describe('Lista dei prodotti da verificare'),
      targetCrop: z
        .string()
        .optional()
        .describe('Coltura target per filtrare (es. "melo", "vite")'),
    }),
    func: async ({ products, targetCrop }) => {
      try {
        const results: ProductAuthResult[] = [];
        for (const product of products) {
          const { authorizedCrops, source } = await resolveProductCrops(
            product.productName,
            product.registrationNumber ?? '',
          );
          let matchesTarget: boolean | null = null;
          if (targetCrop && authorizedCrops.length > 0) {
            const matchResults = await Promise.all(
              authorizedCrops.map((c) =>
                llmMatchAgronomicNames({ nameA: c, nameB: targetCrop, entityType: 'crop' }),
              ),
            );
            matchesTarget = matchResults.some((r) => r.isMatch);
          }
          results.push({
            productName: product.productName,
            registrationNumber: product.registrationNumber ?? '',
            authorizedCrops,
            matchesTarget,
            source,
          });
        }

        if (results.length === 0) {
          return 'Nessun prodotto fornito per la verifica.';
        }

        const targetLabel = targetCrop ? ` per "${targetCrop}"` : '';
        const lines: string[] = [];

        for (const r of results) {
          if (r.authorizedCrops.length === 0) {
            lines.push(
              `- **${r.productName}**${r.registrationNumber ? ` (Reg: ${r.registrationNumber})` : ''}: Nessuna informazione sulle colture autorizzate trovata.`,
            );
            continue;
          }
          const sourceLabel = describeSource(r.source);
          if (targetCrop) {
            const verdict = r.matchesTarget ? 'AUTORIZZATO' : 'NON AUTORIZZATO';
            const matchedCrops = await llmFilterMatchingNames({
              candidates: [...r.authorizedCrops],
              target: targetCrop,
              entityType: 'crop',
            });
            const cropDetail = matchedCrops.length > 0 ? ` (${matchedCrops.join(', ')})` : '';
            lines.push(
              `- **${r.productName}**${r.registrationNumber ? ` (Reg: ${r.registrationNumber})` : ''}: ${verdict}${targetLabel}${cropDetail} | Fonte: ${sourceLabel}`,
            );
          } else {
            lines.push(
              `- **${r.productName}**${r.registrationNumber ? ` (Reg: ${r.registrationNumber})` : ''}: Colture autorizzate: ${r.authorizedCrops.join(', ')} | Fonte: ${sourceLabel}`,
            );
          }
        }

        const header = targetCrop
          ? `Verifica autorizzazioni prodotti${targetLabel} (${results.length} prodotti):`
          : `Colture autorizzate per i prodotti (${results.length} prodotti):`;

        return `${header}\n${lines.join('\n')}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `Errore nella verifica delle autorizzazioni: ${msg}`;
      }
    },
  });
};
