import { JobVerificationInput, PendingAction } from './types';
import { UsageAccumulator, CostCalculator, ModelPricingRegistry } from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { ChatModel } from './graph';
import { LlmJobType } from '@prisma/client';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { prisma } from '../../../repositories/Prisma';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ModificationArgs, QuickModificationCall } from './streaming.part-02-stream-job-verification-chat';
import { StreamEvent, StreamEventType, StreamJobVerificationOptions } from './streaming.part-01-stream-event-type';
import { getToolThinkingMessage } from './streaming.part-05-get-tool-thinking-message';

export async function* streamQuickModificationApproval(params: {
  readonly modificationCalls: readonly QuickModificationCall[];
  readonly jobInput: JobVerificationInput;
  readonly usageAccumulator: UsageAccumulator;
  readonly usageLogger: LlmUsageLogger;
  readonly options: StreamJobVerificationOptions;
  readonly modelName?: ChatModel;
  readonly userId?: string;
}): AsyncGenerator<StreamEvent, void, unknown> {
  const { modificationCalls, jobInput: inputJobs, usageAccumulator, usageLogger, options, modelName, userId } = params;
  const input = inputJobs;

  // Emit tool_start for each proposed modification
  for (const call of modificationCalls) {
    yield {
      type: 'tool_start' as StreamEventType,
      toolCall: { name: call.name, args: call.args as Record<string, unknown> },
      thinking: getToolThinkingMessage(call.name, call.args as Record<string, unknown>),
    };
  }

  // Build a map of jobId → human-readable name from the input jobs
  const jobNameById = new Map<string, string>(
    input.jobs.map((j) => [
      j.job.id as string,
      `${j.productionUnit?.name || j.products?.map((p) => p.name).join(', ') || j.job.id}`,
    ]),
  );

  const modifications = modificationCalls.map((call) => {
    const args = call.args as ModificationArgs;
    return {
      jobId: args.jobId,
      jobName: jobNameById.get(args.jobId) || args.jobId,
      field: args.field,
      oldValue: args.oldValue,
      newValue: args.newValue,
      description: args.reason,
    };
  });

  const modifiedJobIds = new Set(modifications.map((m) => m.jobId));

  // Build per-job summary lines (modified + unmodified)
  const jobSummaryLines = input.jobs.map((j) => {
    const jobId = j.job.id as string;
    const jobName = jobNameById.get(jobId) || jobId;
    const mod = modifications.find((m) => m.jobId === jobId);
    if (mod) {
      return `• **${jobName}**: ${mod.field} ${mod.oldValue} → **${mod.newValue}** (-${Math.round((1 - Number(mod.newValue) / Number(mod.oldValue)) * 100)}%) — ${mod.description}`;
    }
    return `• **${jobName}**: nessuna modifica`;
  });

  const descriptionParts = modifications.map(
    (m) => `${m.jobName} — ${m.field}: ${m.oldValue} → ${m.newValue}`,
  );

  const fullMessage =
    `**Riepilogo ${input.jobs.length} job selezionati:**\n` +
    jobSummaryLines.join('\n') +
    (modifiedJobIds.size < input.jobs.length
      ? `\n\n⚠️ ${input.jobs.length - modifiedJobIds.size} job non modificati (non richiesto o non applicabile).`
      : '');

  const pendingAction: PendingAction = {
    type: 'job_modification',
    tool: 'propose_job_modification',
    modifications,
    description:
      modifications.length === 1
        ? `Modifica ${descriptionParts[0]}`
        : `${modifications.length} modifiche proposte: ${descriptionParts.join('; ')}`,
  };

  // Calculate costs
  const tokens = usageAccumulator.getTotals();
  const pricing = ModelPricingRegistry.getPricing(modelName || 'gpt-4o-mini');
  const cost = CostCalculator.computeCost({
    tokens,
    pricing,
    tavilyCalls: 0,
    margin: 0.2,
  });

  await usageLogger.logFromUsage(tokens, {
    userId,
    jobGroupId: options.threadId,
    jobType: LlmJobType.DOSAGE,
    model: modelName || 'gpt-4o-mini',
    metadata: {
      quickMode: true,
      jobCount: input.jobs.length,
      agentType: 'job_verification_quick_modify',
    },
  });

  if (userId) {
    const userRepository = new PrismaUserRepository(prisma);
    const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
    try {
      await deductCreditsUseCase.execute({ userId, amount: cost.costWithMarginUsd });
    } catch (error) {
      console.error(`[JOB-VERIFICATION-QUICK] Failed to deduct credits:`, error);
    }
  }

  yield {
    type: 'requires_modification_approval',
    pendingAction,
    cost: {
      inputTokens: tokens.promptTokens,
      outputTokens: tokens.completionTokens,
      tavilyCalls: 0,
      totalCostUsd: cost.totalCostUsd,
      costWithMarginUsd: cost.costWithMarginUsd,
    },
    response: {
      status: 'REQUIRES_MODIFICATION_APPROVAL',
      pendingAction,
      message: fullMessage,
    },
  };
  return;
}

export function buildQuickChatMessages(
  input: JobVerificationInput,
  bdfAvailable: boolean,
): (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] {
  const jobsSummary = input.jobs
    .map((item) => {
      const productNames = item.products?.map((product) => product.name).join(', ') || 'N/A';
      const alertNotes = item.job.alertNotes as Record<string, unknown> | null;
      return `
**Prodotto: ${productNames}** [jobId: ${item.job.id}]
- Azienda: ${item.company?.name || 'N/A'}
- Unità produttiva: ${item.productionUnit?.name || 'N/A'}
- Coltura: ${item.productionUnit?.cropName || 'N/A'} (${item.productionUnit?.cropType || ''})
- Quantità: ${item.job.quantity || 0} ${item.job.unitOfMeasureQuantity || ''}
- Superficie trattata: ${item.job.treatedSurface || 0} ha
- Note calcolo dose: ${item.job.note || ''}
${alertNotes ? `- Dose etichetta: ${alertNotes.dose_minima || 'N/A'} - ${alertNotes.dose_massima || 'N/A'} ${alertNotes.dose_um || ''}` : ''}
${alertNotes?.principio_attivo ? `- Principio attivo: ${alertNotes.principio_attivo}` : ''}
${alertNotes?.epoca_impiego ? `- Epoca impiego: ${alertNotes.epoca_impiego}` : ''}`;
    })
    .join('\n\n');
  const bdfInstructions = bdfAvailable
    ? `
- bdf_search_product_doses: Cerca dosi ufficiali di un prodotto nella Banca Dati Fitofarmaci
- bdf_search_products_by_adversity: Cerca prodotti autorizzati per coltura/avversità nella BDF
Usa questi tool quando la domanda riguarda dosi, prodotti autorizzati, o avversità per una coltura. I dati BDF sono ufficiali dal Ministero della Salute.
`
    : '';
  const systemPrompt = `Sei un agronomo esperto che fornisce pareri rapidi sulle operazioni agricole.

TOOL DISPONIBILI:
- propose_job_modification: Propone una modifica ad un campo del job. Usare SEMPRE quando l'utente chiede di modificare dati (quantità, dose, data, note, ecc.).
${bdfInstructions}
REGOLE GENERALI:
- Rispondi in modo CONCISO e DIRETTO (max 3-4 paragrafi)
- NON usare MAI ID tecnici, usa solo nomi leggibili
- Indica sempre: prodotto, dose, motivazione agronomica breve
- Se noti problemi evidenti, segnalali subito
- Se tutto sembra ok, conferma brevemente

🔴 REGOLA CRITICA PER MODIFICHE:
- Se l'utente chiede di MODIFICARE, CAMBIARE, RIDURRE, AUMENTARE o AGGIORNARE qualsiasi dato di un job, devi OBBLIGATORIAMENTE usare il tool 'propose_job_modification'.
- NON rispondere solo con testo quando l'utente vuole cambiare dati: chiama SEMPRE propose_job_modification.
- Il jobId è indicato tra parentesi quadre accanto al nome prodotto: es. [jobId: c912d79b-...]. Usa SEMPRE questo ID esatto nel campo jobId della chiamata al tool.
- Calcola il nuovo valore, poi chiama propose_job_modification con: jobId (l'ID tra parentesi quadre), field (il campo da cambiare, es. "quantity"), oldValue (valore attuale come stringa), newValue (nuovo valore numerico calcolato come stringa, SENZA unità di misura), reason (motivazione agronomica).
- Per quantità/dose: il campo è "quantity" e il valore è la quantità totale in litri (superficie_ha * dose_l_ha). Esempio: superficie 0.85 ha, dose 1.80 L/ha → newValue = "1.53".

Questo è un parere RAPIDO - l'utente può richiedere analisi approfondita se necessario.`;
  const userMessage = `
OPERAZIONI DA VALUTARE:
${jobsSummary}

DOMANDA UTENTE: ${input.message}

Fornisci un parere rapido e conciso.`;
  return [new SystemMessage(systemPrompt), new HumanMessage(userMessage)];
}
