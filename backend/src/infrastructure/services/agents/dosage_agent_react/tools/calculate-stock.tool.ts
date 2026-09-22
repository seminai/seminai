import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  calculateStockBalance,
  printStockBalanceReport,
} from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';

/**
 * Tool: calculate_stock_balance
 * Calculates product stock usage balance across production units.
 */
export function createCalculateStockTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'calculate_stock_balance',
    description: `Calcola il bilancio di magazzino per tutti i prodotti: quantità disponibile vs quantità utilizzata nei trattamenti.
Identifica prodotti in overstock (utilizzati più del disponibile).
Richiede che calculate_dosage sia stato eseguito prima (usa dosageResults dalla working memory).
Salva il risultato in working memory (stockBalance).`,
    schema: z.object({}),
    func: async () => {
      try {
        if (!hasWorkingMemoryData(threadId, 'dosageResults')) {
          return JSON.stringify({
            error: 'Prerequisito mancante: dosageResults',
            hint: 'Eseguire prima calculate_dosage per calcolare i dosaggi.',
          });
        }

        const wm = getWorkingMemory(threadId);
        const units = [...(wm.dosageResults ?? [])];

        const stockBalance = calculateStockBalance(units);
        updateWorkingMemory(threadId, { stockBalance });

        // Format report
        const report = printStockBalanceReport(stockBalance);

        const overusedProducts = stockBalance.products.filter((product) => product.isOverused);

        return JSON.stringify({
          totalProducts: stockBalance.products.length,
          overusedCount: overusedProducts.length,
          products: stockBalance.products.map((p) => ({
            name: p.productName,
            regNumber: p.regNumber,
            available: `${p.quantityAvailable} ${p.quantityUom}`,
            used: `${p.totalUsed.toFixed(2)} ${p.quantityUom}`,
            balance: `${p.balance.toFixed(2)} ${p.quantityUom}`,
            percentageUsed: `${p.percentageUsed.toFixed(1)}%`,
            isOverused: p.isOverused,
          })),
          report,
          workingMemoryKey: 'stockBalance',
          recommendation:
            overusedProducts.length > 0
              ? `${overusedProducts.length} prodotti superano lo stock disponibile. Considerare optimize_dosage per scalare le dosi.`
              : 'Tutti i prodotti rientrano nello stock disponibile.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
