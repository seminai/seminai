import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, hasWorkingMemoryData, updateWorkingMemory } from '../working-memory';
import { toolError, toolMissingPrerequisite } from '../../shared/toolResult';
import type { OrchestratorConfig } from '../../dosage_agent/types';
import { getDosageAgentQueue } from '../../../../queue/DosageAgentQueue';
import { PrismaDosageAgentJobRepository } from '../../../../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../../../../repositories/Prisma';
import { DosageAgentJobState } from '../../../../../domain/entities/DosageAgentJob';
import { ProductInput, UnitInput, VALID_INTENSITIES, VALID_OBJECTIVES, VALID_STRATEGIES, buildInputDosageAgent, inferRequestedProductsFromText, loadLatestUserPlanningMessage, selectProductsFromRequests } from './start-dosage-agent-job.tool.part-01-valid-strategies';

export function createStartDosageAgentJobTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'start_dosage_agent_job',
    description: `Avvia il calcolo completo del piano dosaggi come job asincrono.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool DEVI aver:
1. Scoperto il contesto (list_production_units, list_company_products)
2. Raccolto le preferenze dell'utente con ask_user_questions (unità, prodotti, tempistica, strategia, priorità avversità, note agronomiche)
3. Presentato un RIEPILOGO COMPLETO all'utente con tutti i dati raccolti
4. Ricevuto conferma esplicita dall'utente

Legge inputProducts e inputUnits dalla working memory.
Se l'utente ha indicato prodotti specifici, DEVI passare selectedProducts con quei soli prodotti:
non usare mai tutto il magazzino come piano quando la richiesta contiene un elenco prodotto/quantita.
	Salva il riferimento tecnico del job in working memory per monitorare lo stato del calcolo.
	Non comunicare identificativi tecnici all'utente.`,
    schema: z.object({
      selectedProducts: z
        .array(
          z.object({
            productName: z.string().describe('Nome prodotto richiesto dall’utente'),
            registrationNumber: z.string().optional().describe('Numero registrazione, se noto'),
            quantity: z.number().optional().describe('Quantita richiesta o disponibile indicata'),
            quantityUnitOfMeasure: z.string().optional().describe('Unita di misura della quantita'),
          }),
        )
        .optional()
        .describe(
          'Prodotti esplicitamente richiesti dall’utente. Se presente, il job usera SOLO questi prodotti, filtrandoli dai prodotti in working memory.',
        ),
      strategy: z
        .enum(['min', 'max', 'avg', 'current'])
        .optional()
        .default('avg')
        .describe('Strategia di dosaggio: min, max, avg (default), current'),
      startAt: z
        .string()
        .optional()
        .describe('Data inizio finestra pianificazione (ISO, es. "2025-03-01")'),
      endAt: z
        .string()
        .optional()
        .describe('Data fine finestra pianificazione (ISO, es. "2025-10-31")'),
      outStockLimiter: z
        .boolean()
        .optional()
        .default(false)
        .describe('Se true, scala le dosi per rispettare lo stock disponibile'),
      objective: z
        .enum(['minimize_interventions', 'maximize_coverage', 'balanced', 'cost_effective'])
        .optional()
        .default('balanced')
        .describe(
          'Obiettivo pianificazione: balanced (default), minimize_interventions, maximize_coverage, cost_effective',
        ),
      intensity: z
        .enum(['low', 'medium', 'high'])
        .optional()
        .describe('Intensità protezione: low (1-3 prodotti/unità), medium (4-6), high (7-10)'),
      priorityTargets: z
        .array(z.string())
        .optional()
        .describe('Avversità prioritarie (es. ["Peronospora", "Oidio"])'),
      agronomicNotes: z
        .string()
        .optional()
        .describe(
          'Note agronomiche libere (es. "Pressione oidio alta", "Evitare rame in fioritura")',
        ),
    }),
    func: async ({
      strategy,
      startAt,
      endAt,
      outStockLimiter,
      objective,
      intensity,
      priorityTargets,
      agronomicNotes,
      selectedProducts,
    }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'inputProducts')) {
          return toolMissingPrerequisite(
            'inputProducts',
            'Eseguire prima list_company_products per caricare i prodotti disponibili.',
          );
        }
        if (!hasWorkingMemoryData(threadId, 'inputUnits')) {
          return toolMissingPrerequisite(
            'inputUnits',
            'Eseguire prima list_production_units per caricare le unità produttive.',
          );
        }

        const wm = getWorkingMemory(threadId);
        const availableProducts = (wm.inputProducts ?? []) as ProductInput[];
        const units = (wm.inputUnits ?? []) as UnitInput[];

        if (availableProducts.length === 0) {
          return toolError('Nessun prodotto disponibile nella working memory.');
        }
        if (units.length === 0) {
          return toolError('Nessuna unità produttiva disponibile nella working memory.');
        }

        if (strategy && !VALID_STRATEGIES.includes(strategy)) {
          return toolError(
            `Strategia non valida: ${strategy}. Valide: ${VALID_STRATEGIES.join(', ')}`,
          );
        }
        if (objective && !VALID_OBJECTIVES.includes(objective)) {
          return toolError(
            `Obiettivo non valido: ${objective}. Validi: ${VALID_OBJECTIVES.join(', ')}`,
          );
        }
        if (intensity && !VALID_INTENSITIES.includes(intensity)) {
          return toolError(
            `Intensità non valida: ${intensity}. Valide: ${VALID_INTENSITIES.join(', ')}`,
          );
        }

        const orchestrator: OrchestratorConfig = {
          ...(objective ? { objective: objective as OrchestratorConfig['objective'] } : {}),
          ...(intensity ? { intensity: intensity as OrchestratorConfig['intensity'] } : {}),
          ...(priorityTargets && priorityTargets.length > 0 ? { priorityTargets } : {}),
          ...(agronomicNotes ? { agronomicNotes } : {}),
        };

        const explicitRequests = selectedProducts ?? [];
        const inferredRequests =
          explicitRequests.length > 0
            ? []
            : inferRequestedProductsFromText(
                availableProducts,
                await loadLatestUserPlanningMessage(threadId),
              );
        const productRequests = explicitRequests.length > 0 ? explicitRequests : inferredRequests;
        const selection =
          productRequests.length > 0
            ? selectProductsFromRequests({
                availableProducts,
                requestedProducts: productRequests,
              })
            : { products: [...availableProducts], unmatched: [] };

        if (selection.unmatched.length > 0) {
          return toolError(
            `Prodotti richiesti non trovati in magazzino: ${selection.unmatched.join(', ')}. ` +
              'Ricarica i prodotti con list_company_products o chiedi conferma del nome.',
          );
        }
        if (selection.products.length === 0) {
          return toolError(
            'Nessun prodotto selezionato per il piano. Passa selectedProducts con i prodotti richiesti.',
          );
        }
        const products = selection.products;

        const input = buildInputDosageAgent({
          products,
          units,
          strategy,
          startAt,
          endAt,
          outStockLimiter,
          orchestrator: Object.keys(orchestrator).length > 0 ? orchestrator : undefined,
        });

        const queue = getDosageAgentQueue();
        const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);

        const jobId = await queue.addJob({ input, userId });

        await dosageAgentJobRepository.updateStatus({
          jobId,
          userId,
          state: DosageAgentJobState.QUEUED,
          progress: 0,
          failedReason: null,
        });

        updateWorkingMemory(threadId, {
          dosageJobId: jobId,
          planningPreferences: {
            strategy: (strategy as 'min' | 'max' | 'avg' | 'current') ?? 'avg',
            startAt: startAt ?? undefined,
            endAt: endAt ?? undefined,
            outStockLimiter: outStockLimiter ?? false,
            objective:
              (objective as
                | 'minimize_interventions'
                | 'maximize_coverage'
                | 'balanced'
                | 'cost_effective') ?? 'balanced',
            intensity: intensity as 'low' | 'medium' | 'high' | undefined,
            priorityTargets: priorityTargets?.length ? priorityTargets : undefined,
            agronomicNotes: agronomicNotes ?? undefined,
            selectedProducts: products.map((product) => ({
              productName: product.productName,
              registrationNumber: product.registrationNumber,
              quantity: product.quantity,
              quantityUnitOfMeasure: product.quantityUnitOfMeasure,
            })),
          },
        });

        return JSON.stringify({
          jobId,
          status: 'QUEUED',
          productsCount: products.length,
          unitsCount: units.length,
          selectedProducts: products.map((product) => product.productName),
          strategy: strategy ?? 'avg',
          planningWindow:
            startAt || endAt ? { startAt: startAt ?? null, endAt: endAt ?? null } : null,
          orchestrator: Object.keys(orchestrator).length > 0 ? orchestrator : null,
          message:
            `Calcolo accurato del piano dosaggi avviato con successo. ` +
            `${products.length} prodotti su ${units.length} unità produttive. ` +
            `Strategia: ${strategy ?? 'avg'}. ` +
            `A completamento, le operazioni saranno salvate in Archivio come gruppo da validare.`,
          hint:
            "Informa l'utente che il calcolo è in corso senza comunicare identificativi tecnici. " +
            'Il risultato sarà disponibile nella dashboard dei job e in Archivio come operazioni da validare.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return toolError(`Errore nell'avvio del job: ${msg}`);
      }
    },
  });
}
