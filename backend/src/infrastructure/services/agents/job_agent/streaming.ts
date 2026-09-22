import {
  createJobVerificationAgentApp,
  extractSourcesFromMessages,
} from './ChatJobVerificationAgent';
import {
  SourceCitation,
  AgentResponse,
  AgentTask,
  JobVerificationInput,
  PendingAction,
} from './types';
import {
  LangChainUsageCollector,
  UsageAccumulator,
  CostCalculator,
  ModelPricingRegistry,
} from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { ChatModel, DEFAULT_RECURSION_LIMIT } from './graph';
import {
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { getSharedContextManager } from './context-manager';
import {
  createCachedBdfClient,
  createBdfSearchProductDosesTool,
  createBdfSearchProductsByAdversityTool,
} from '../../integrations/bdf';
import { createProposeJobModificationTool } from './tools';
import { createChatModel } from '../../llm-model-factory';

/**
 * Stream event types emitted during agent execution.
 */
export type StreamEventType =
  | 'token'
  | 'reasoning'
  | 'thinking' // New: agent's thinking process
  | 'tool_call'
  | 'tool_start' // New: when a tool starts execution
  | 'tool_result'
  | 'task_update'
  | 'task_progress' // New: task progress within a task
  | 'sources_update'
  | 'data_inspection' // New: when inspecting job data
  | 'complete'
  | 'requires_approval'
  | 'requires_modification_approval'
  | 'error';

/**
 * Stream event emitted during agent execution.
 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  reasoning?: string;
  thinking?: string; // Agent's thought process
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  toolResult?: {
    name: string;
    result: string;
    summary?: string; // Human-readable summary of the result
  };
  dataInspection?: {
    path: string;
    jobId: string;
    summary: string;
  };
  tasks?: AgentTask[];
  currentTaskId?: string;
  sources?: SourceCitation[];
  pendingAction?: PendingAction;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    tavilyCalls: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
  };
  error?: string;
  response?: AgentResponse;
}

/**
 * Options for streaming agent execution.
 */
export interface StreamJobVerificationOptions {
  threadId: string;
  input: JobVerificationInput;
  userId?: string;
  modelName?: ChatModel;
  temperature?: number;
  /**
   * If true, uses full agent with tools and deep analysis.
   * If false, uses quick LLM chat without tools for fast responses.
   * Default: true
   */
  deepThinking?: boolean;
}

function parsePossiblyJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Streaming function for job verification agent chat.
 * Uses streamEvents() for real-time token streaming and tool visibility.
 * If deepThinking=false, uses quick chat mode without tools.
 */
export async function* streamJobVerificationChat(
  options: StreamJobVerificationOptions,
): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const { threadId, input, userId, modelName, temperature, deepThinking = true } = options;

  // Quick chat mode - fast LLM response without tools
  if (!deepThinking) {
    yield* streamQuickChat(options);
    return {
      status: 'COMPLETED',
      message: 'Risposta rapida completata.',
    };
  }

  // Initialize agent app
  const app = createJobVerificationAgentApp({
    modelName: modelName || 'gpt-4o',
    temperature,
    userId,
  });

  // Initialize cost tracking
  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  let tavilyCalls = 0;
  const usageLogger = LlmUsageLogger.getInstance();

  try {
    const config = { configurable: { thread_id: threadId } };

    // Build user message with context
    let messageContent = input.message;
    if (input.metadata) {
      const metadataContext: string[] = [];
      if (input.metadata.images?.length) {
        metadataContext.push(`[Immagini allegate: ${input.metadata.images.length}]`);
      }
      if (input.metadata.links?.length) {
        metadataContext.push(`[Link allegati: ${input.metadata.links.join(', ')}]`);
      }
      if (input.metadata.pdfs?.length) {
        metadataContext.push(`[PDF allegati: ${input.metadata.pdfs.length}]`);
      }
      if (metadataContext.length > 0) {
        messageContent = `${metadataContext.join(' ')}\n\n${messageContent}`;
      }
    }

    const inputs = {
      messages: [new HumanMessage(messageContent)],
      jobs: input.jobs,
      metadata: input.metadata,
    };

    // Track state for streaming
    let accumulatedContent = '';
    let currentTasks: AgentTask[] = [];
    let currentSources: SourceCitation[] = [];
    let currentNodeName = '';
    let lastEmittedThinking = '';

    // Use streamEvents for real-time streaming
    const eventStream = app.streamEvents(inputs, {
      ...config,
      version: 'v2',
      callbacks: [usageCollector],
      recursionLimit: DEFAULT_RECURSION_LIMIT,
    });

    for await (const event of eventStream) {
      const eventType = event.event;
      const eventName = event.name;
      const eventData = event.data;

      // Track which node we're in
      if (eventType === 'on_chain_start' && eventName) {
        const nodeName = eventName;
        if (
          nodeName !== currentNodeName &&
          !nodeName.includes('RunnableSequence') &&
          !nodeName.includes('ChannelWrite')
        ) {
          currentNodeName = nodeName;

          // Emit thinking for node changes
          const thinkingMessage = getNodeThinkingMessage(nodeName);
          if (thinkingMessage && thinkingMessage !== lastEmittedThinking) {
            lastEmittedThinking = thinkingMessage;
            yield {
              type: 'thinking',
              thinking: thinkingMessage,
            };
          }
        }
      }

      // Handle LLM token streaming
      if (eventType === 'on_llm_stream') {
        const chunk = eventData?.chunk;
        if (chunk instanceof AIMessageChunk && chunk.content) {
          const content = chunk.content.toString();
          if (content) {
            accumulatedContent += content;
            yield {
              type: 'token',
              content: content,
            };
          }
        }
      }

      // Handle tool start
      if (eventType === 'on_tool_start') {
        const toolName = eventName || 'unknown';
        const initialToolInput = eventData?.input || {};
        let toolInput = parsePossiblyJson(initialToolInput);
        const nestedInput = asRecord(toolInput)?.input;
        toolInput = parsePossiblyJson(nestedInput ?? toolInput);
        const normalizedToolInput = asRecord(toolInput) ?? {};

        if (toolName === 'tavily_search') {
          tavilyCalls++;
        }

        // Emit tool_start with thinking
        const thinkingMessage = getToolThinkingMessage(toolName, normalizedToolInput);
        yield {
          type: 'tool_start',
          toolCall: {
            name: toolName,
            args: normalizedToolInput,
          },
          thinking: thinkingMessage,
        };

        // For inspection tools, emit data_inspection event
        if (toolName === 'inspect_job_data' || toolName === 'list_job_paths') {
          const path = (normalizedToolInput as { path?: string }).path || 'root';
          yield {
            type: 'data_inspection',
            dataInspection: {
              path: path,
              jobId: (normalizedToolInput as { jobId?: string }).jobId || '',
              summary:
                toolName === 'inspect_job_data'
                  ? `Sto leggendo ${getHumanReadablePathName(path)}`
                  : 'Sto esplorando le informazioni disponibili',
            },
          };
        }

        yield {
          type: 'tool_call',
          toolCall: {
            name: toolName,
            args: normalizedToolInput,
          },
        };
      }

      // Handle tool end
      if (eventType === 'on_tool_end') {
        const toolName = eventName || 'unknown';
        const output = eventData?.output;
        const content = typeof output === 'string' ? output : JSON.stringify(output);
        const resultSummary = getToolResultSummary(toolName, content);

        yield {
          type: 'tool_result',
          toolResult: {
            name: toolName,
            result: content.length > 500 ? content.substring(0, 500) + '...' : content,
            summary: resultSummary,
          },
          thinking: resultSummary || 'Informazioni raccolte con successo',
        };
      }

      // Handle chain end to track state updates
      if (eventType === 'on_chain_end' && eventData?.output) {
        const output = eventData.output;

        // Track tasks updates
        if (output.tasks && JSON.stringify(output.tasks) !== JSON.stringify(currentTasks)) {
          const previousTasks = currentTasks;
          currentTasks = output.tasks;

          yield {
            type: 'task_update',
            tasks: currentTasks,
            currentTaskId: output.currentTaskId,
          };

          // Emit task_progress for status changes
          for (const task of currentTasks) {
            const prevTask = previousTasks.find((t: AgentTask) => t.id === task.id);
            if (prevTask && prevTask.status !== task.status) {
              const statusMessage = getTaskStatusMessage(task.status, task.description);
              yield {
                type: 'task_progress',
                thinking: statusMessage,
                tasks: currentTasks,
                currentTaskId: task.id,
              };
            }
          }
        }

        // Track sources updates
        if (output.sources && output.sources.length > currentSources.length) {
          const previousCount = currentSources.length;
          currentSources = output.sources;
          const newSourcesCount = currentSources.length - previousCount;
          yield {
            type: 'sources_update',
            sources: currentSources,
            thinking:
              newSourcesCount === 1
                ? '📚 Ho trovato una nuova fonte di informazioni'
                : `📚 Ho trovato ${newSourcesCount} nuove fonti di informazioni`,
          };
        }

        // Track reasoning
        if (output.reasoning) {
          // Make reasoning more user-friendly by summarizing it
          const reasoningSummary = getReasoningSummary(output.reasoning);
          yield {
            type: 'reasoning',
            reasoning: output.reasoning,
            thinking: reasoningSummary,
          };
        }
      }
    }

    // Get final state
    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;

    // Log context usage for monitoring
    const contextManager = getSharedContextManager();
    const finalTokenCount = contextManager.getTokenCount(state.messages);
    console.log(
      `[JOB-VERIFICATION-AGENT] Final context size: ${finalTokenCount} tokens (${state.messages.length} messages)`,
    );

    // Check if modification approval is needed
    if (state.requiresHumanInput && state.pendingAction) {
      yield {
        type: 'requires_modification_approval',
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
      return {
        status: 'REQUIRES_MODIFICATION_APPROVAL',
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }

    // Check if tool approval is needed
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };

    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      yield {
        type: 'requires_approval',
        toolCall: {
          name: lastMessage.tool_calls[0].name,
          args: lastMessage.tool_calls[0].args,
          id: lastMessage.tool_calls[0].id,
        },
      };
      return {
        status: 'REQUIRES_APPROVAL',
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }

    // Extract sources
    const sources = state.sources || extractSourcesFromMessages(state.messages);

    // Calculate costs
    const tokens = usageAccumulator.getTotals();
    const pricing = ModelPricingRegistry.getPricing(modelName || 'gpt-4o');
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      tavilyCalls,
      margin: 0.2,
    });

    await usageLogger.logFromUsage(tokens, {
      userId,
      jobGroupId: threadId,
      jobType: LlmJobType.DOSAGE,
      model: modelName || 'gpt-4o',
      metadata: { tavilyCalls, jobCount: input.jobs.length, agentType: 'job_verification' },
    });

    // Deduct credits if userId provided
    if (userId) {
      const userRepository = new PrismaUserRepository(prisma);
      const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
      try {
        await deductCreditsUseCase.execute({
          userId,
          amount: cost.costWithMarginUsd,
        });
        console.log(
          `[JOB-VERIFICATION-AGENT] Deducted ${cost.costWithMarginUsd} credits from user ${userId}`,
        );
      } catch (error) {
        console.error(`[JOB-VERIFICATION-AGENT] Failed to deduct credits:`, error);
      }
    }

    // Get final message
    const finalMessage =
      state.finalAnswer ||
      (lastMessage instanceof AIMessage ? lastMessage.content?.toString() : undefined) ||
      accumulatedContent ||
      'Elaborazione completata.';

    // Emit final event with costs
    yield {
      type: 'complete',
      sources,
      reasoning: state.reasoning,
      tasks: state.tasks,
      cost: {
        inputTokens: tokens.promptTokens,
        outputTokens: tokens.completionTokens,
        tavilyCalls,
        totalCostUsd: cost.totalCostUsd,
        costWithMarginUsd: cost.costWithMarginUsd,
      },
      response: {
        status: 'COMPLETED',
        message: finalMessage,
        reasoning: state.reasoning,
        sources,
        tasks: state.tasks,
      },
    };

    return {
      status: 'COMPLETED',
      message: finalMessage,
      reasoning: state.reasoning,
      sources,
      tasks: state.tasks,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    yield {
      type: 'error',
      error: errorMessage,
    };
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}

/**
 * Quick chat mode - fast LLM response without tools or deep analysis.
 * Uses a single LLM call with job context for rapid user feedback.
 */
async function* streamQuickChat(
  options: StreamJobVerificationOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const { input, userId, modelName, temperature } = options;

  // Initialize cost tracking
  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const usageLogger = LlmUsageLogger.getInstance();

  // Emit thinking event
  yield {
    type: 'thinking',
    thinking: '⚡ Modalità rapida - analisi veloce...',
  };

  try {
    const { model } = createChatModel({
      modelName: modelName || 'gpt-4o-mini', // Use faster model for quick chat
      temperature: temperature ?? 0.3,
      streaming: true,
      callbacks: [usageCollector],
    });

    // Create BDF tools if credentials available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdfTools: Array<{ name: string; invoke: (args: any) => Promise<any> }> = [];
    const bdfBaseUrl = process.env.URL_SERVER_BDF;
    const bdfUsername = process.env.USERNAME_BDF;
    const bdfPassword = process.env.PASSWORD_BDF;
    if (bdfBaseUrl && bdfUsername && bdfPassword) {
      const bdfClient = createCachedBdfClient();
      bdfTools.push(
        createBdfSearchProductDosesTool(bdfClient),
        createBdfSearchProductsByAdversityTool(bdfClient),
      );
    }

    // Always include propose_job_modification tool so quick mode can propose changes
    const proposeModificationTool = createProposeJobModificationTool();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allQuickTools: Array<{ name: string; invoke: (args: any) => Promise<any> }> = [
      ...bdfTools,
      proposeModificationTool as unknown as { name: string; invoke: (args: any) => Promise<any> },
    ];

    // Bind all tools
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelForChat = model.bindTools(allQuickTools as any);

    // Build job summary for context
    const jobsSummary = input.jobs
      .map((j) => {
        const productNames = j.products?.map((p) => p.name).join(', ') || 'N/A';
        const quantity = j.job.quantity || 0;
        const unit = j.job.unitOfMeasureQuantity || '';
        const note = j.job.note || '';
        const alertNotes = j.job.alertNotes as Record<string, unknown> | null;

        return `
**Prodotto: ${productNames}** [jobId: ${j.job.id}]
- Azienda: ${j.company?.name || 'N/A'}
- Unità produttiva: ${j.productionUnit?.name || 'N/A'}
- Coltura: ${j.productionUnit?.cropName || 'N/A'} (${j.productionUnit?.cropType || ''})
- Quantità: ${quantity} ${unit}
- Superficie trattata: ${j.job.treatedSurface || 0} ha
- Note calcolo dose: ${note}
${alertNotes ? `- Dose etichetta: ${alertNotes.dose_minima || 'N/A'} - ${alertNotes.dose_massima || 'N/A'} ${alertNotes.dose_um || ''}` : ''}
${alertNotes?.principio_attivo ? `- Principio attivo: ${alertNotes.principio_attivo}` : ''}
${alertNotes?.epoca_impiego ? `- Epoca impiego: ${alertNotes.epoca_impiego}` : ''}`;
      })
      .join('\n\n');

    const bdfInstructions =
      bdfTools.length > 0
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

    const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ];

    let accumulatedContent = '';

    // Stream the response
    const stream = await modelForChat.stream(messages);
    let fullMessage: AIMessageChunk | null = null;

    for await (const chunk of stream) {
      if (chunk.content) {
        const content = chunk.content.toString();
        accumulatedContent += content;
        yield {
          type: 'token',
          content: content,
        };
      }
      // Accumulate full message for tool call detection
      fullMessage = fullMessage ? (fullMessage.concat(chunk) as AIMessageChunk) : chunk;
    }

    // Handle tool calls if the model decided to use them
    if (fullMessage?.tool_calls?.length) {
      // Collect ALL propose_job_modification calls (LLM may call it once per job)
      type ModificationArgs = {
        jobId: string;
        field: string;
        oldValue: string;
        newValue: string;
        reason: string;
      };
      const modificationCalls = fullMessage.tool_calls.filter(
        (tc) => tc.name === 'propose_job_modification',
      );

      if (modificationCalls.length > 0) {
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

      // Handle BDF tool calls
      const toolResultMessages: ToolMessage[] = [];

      for (const tc of fullMessage.tool_calls) {
        const tool = allQuickTools.find((t) => t.name === tc.name);
        if (!tool) continue;

        yield {
          type: 'tool_start' as StreamEventType,
          toolCall: { name: tc.name, args: tc.args as Record<string, unknown> },
          thinking: getToolThinkingMessage(tc.name, tc.args as Record<string, unknown>),
        };

        const result = await tool.invoke(tc.args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

        toolResultMessages.push(
          new ToolMessage({
            content: resultStr,
            tool_call_id: tc.id || `tc_${Date.now()}`,
            name: tc.name,
          }),
        );

        const resultSummary = getToolResultSummary(tc.name, resultStr);
        yield {
          type: 'tool_result' as StreamEventType,
          toolResult: {
            name: tc.name,
            result: resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr,
            summary: resultSummary,
          },
          thinking: resultSummary || 'Informazioni raccolte con successo',
        };
      }

      if (toolResultMessages.length > 0) {
        // Build the AI message with tool calls for conversation continuity
        const aiMessage = new AIMessage({
          content: accumulatedContent || '',
          tool_calls: fullMessage.tool_calls.map((tc) => ({
            name: tc.name,
            args: tc.args,
            id: tc.id || `tc_${Date.now()}`,
            type: 'tool_call' as const,
          })),
        });

        // Stream follow-up response with tool results (without tools to prevent loops)
        const followUpMessages = [...messages, aiMessage, ...toolResultMessages];
        accumulatedContent = '';
        const followUpStream = await model.stream(followUpMessages);
        for await (const chunk of followUpStream) {
          if (chunk.content) {
            const content = chunk.content.toString();
            accumulatedContent += content;
            yield {
              type: 'token',
              content: content,
            };
          }
        }
      }
    }

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
        agentType: 'job_verification_quick',
      },
    });

    // Deduct credits if userId provided
    if (userId) {
      const userRepository = new PrismaUserRepository(prisma);
      const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
      try {
        await deductCreditsUseCase.execute({
          userId,
          amount: cost.costWithMarginUsd,
        });
        console.log(
          `[JOB-VERIFICATION-QUICK] Deducted ${cost.costWithMarginUsd} credits from user ${userId}`,
        );
      } catch (error) {
        console.error(`[JOB-VERIFICATION-QUICK] Failed to deduct credits:`, error);
      }
    }

    // Emit complete event
    yield {
      type: 'complete',
      reasoning: 'Parere rapido completato (senza analisi approfondita)',
      cost: {
        inputTokens: tokens.promptTokens,
        outputTokens: tokens.completionTokens,
        tavilyCalls: 0,
        totalCostUsd: cost.totalCostUsd,
        costWithMarginUsd: cost.costWithMarginUsd,
      },
      response: {
        status: 'COMPLETED',
        message: accumulatedContent,
        reasoning: 'Parere rapido (modalità quick)',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    yield {
      type: 'error',
      error: errorMessage,
    };
  }
}

/**
 * Helper to generate thinking message for node transitions
 */
function getNodeThinkingMessage(nodeName: string): string {
  const nodeMessages: Record<string, string> = {
    optimize_request: '📋 Sto analizzando la tua richiesta...',
    plan_tasks: '📝 Sto preparando un piano di lavoro per rispondere alla tua domanda...',
    agent: '🤔 Sto valutando il prossimo passo da compiere...',
    tools: '🔧 Sto raccogliendo le informazioni necessarie...',
    generate_answer: '✍️ Sto preparando la risposta finale...',
  };
  return nodeMessages[nodeName] || '';
}

/**
 * Helper to generate thinking message for tool calls
 */
function getToolThinkingMessage(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'list_job_paths':
      return `🔍 Sto esplorando i dati disponibili per questa operazione...`;
    case 'inspect_job_data':
      const pathName = getHumanReadablePathName(args.path as string);
      return `📖 Sto leggendo ${pathName}...`;
    case 'extract_label_data':
      const productName = (args.productName as string) || 'il prodotto';
      return `🏷️ Sto analizzando l'etichetta del prodotto ${productName}...`;
    case 'tavily_search':
      const query = (args.query as string) || '';
      const shortQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;
      return `🌐 Sto cercando informazioni su: ${shortQuery}...`;
    case 'search_disciplinari':
      const prodName = (args.productName as string) || 'il prodotto';
      return `📚 Sto verificando i disciplinari di produzione integrata per ${prodName}...`;
    case 'vector_search_documents':
      const searchQuery = (args.query as string) || '';
      const shortSearchQuery =
        searchQuery.length > 50 ? searchQuery.substring(0, 50) + '...' : searchQuery;
      return `🔎 Sto cercando nei documenti: ${shortSearchQuery}...`;
    case 'bdf_search_product_doses':
      const bdfProd = (args.productName as string) || 'il prodotto';
      return `🔍 Sto cercando le dosi ufficiali di ${bdfProd} nella Banca Dati Fitofarmaci...`;
    case 'bdf_search_products_by_adversity':
      const bdfCrop = (args.cropName as string) || 'la coltura';
      const bdfAdv = (args.adversityName as string) || "l'avversità";
      return `🔍 Sto cercando i prodotti autorizzati per ${bdfAdv} su ${bdfCrop} nella BDF...`;
    case 'propose_job_modification':
      const fieldName = getHumanReadableFieldName(args.field as string);
      return `✏️ Sto preparando una proposta di modifica per ${fieldName}...`;
    default:
      return `⚙️ Sto elaborando le informazioni...`;
  }
}

/**
 * Helper to convert technical path names to human-readable descriptions
 */
function getHumanReadablePathName(path: string): string {
  const pathMap: Record<string, string> = {
    note: 'le note del trattamento',
    alertNotes: 'le informazioni di sicurezza e conformità',
    history: 'la cronologia delle decisioni',
    root: 'i dati principali',
  };
  return pathMap[path] || `i dati (${path})`;
}

/**
 * Helper to convert technical field names to human-readable descriptions
 */
function getHumanReadableFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    quantity: 'la quantità',
    dateOfOpeation: 'la data di operazione',
    note: 'le note',
    treatedSurface: 'la superficie trattata',
    modeOfApplication: 'la modalità di applicazione',
  };
  return fieldMap[field] || field;
}

/**
 * Helper to generate a user-friendly summary of reasoning messages
 */
function getReasoningSummary(reasoning: string): string {
  // If reasoning is very technical, provide a simpler summary
  if (reasoning.includes('job') && reasoning.includes('analisi')) {
    return 'Sto analizzando le informazioni raccolte...';
  }
  if (reasoning.includes('fonti') || reasoning.includes('sources')) {
    return 'Sto consultando le fonti di informazioni...';
  }
  if (reasoning.includes('completata') || reasoning.includes('completato')) {
    return 'Analisi completata';
  }
  // For other cases, try to extract a simple summary
  const shortReasoning = reasoning.length > 80 ? reasoning.substring(0, 80) + '...' : reasoning;
  return shortReasoning;
}

/**
 * Helper to generate human-readable task status messages
 */
function getTaskStatusMessage(status: string, description: string): string {
  const statusMap: Record<string, string> = {
    pending: 'in attesa',
    in_progress: 'in corso',
    completed: 'completato',
    cancelled: 'annullato',
  };
  const statusText = statusMap[status] || status;

  // Make description more user-friendly by removing technical terms
  const friendlyDescription = description
    .replace(/list_job_paths/gi, 'esplorazione dati')
    .replace(/inspect_job_data/gi, 'lettura informazioni')
    .replace(/tavily_search/gi, 'ricerca web')
    .replace(/search_disciplinari/gi, 'verifica disciplinari')
    .replace(/Usa /g, '')
    .replace(/per /g, '');

  return `${friendlyDescription} - ${statusText}`;
}

/**
 * Helper to generate summary for tool results
 */
function getToolResultSummary(toolName: string, content: string): string {
  try {
    if (toolName === 'list_job_paths') {
      const parsedRecord = asRecord(JSON.parse(content));
      if (!parsedRecord) return content.length > 100 ? content.substring(0, 100) + '...' : content;
      const summary = asRecord(parsedRecord.summary);
      const totalPaths = typeof summary?.totalPaths === 'number' ? summary.totalPaths : 0;
      if (totalPaths === 0) {
        return 'Nessun dato trovato';
      }
      return `Trovate ${totalPaths} sezioni di informazioni disponibili`;
    }
    if (toolName === 'inspect_job_data') {
      const parsedRecord = asRecord(JSON.parse(content));
      if (!parsedRecord) return content.length > 100 ? content.substring(0, 100) + '...' : content;
      if (parsedRecord.type === 'array') {
        const count = typeof parsedRecord.length === 'number' ? parsedRecord.length : 0;
        return `Trovati ${count} elementi`;
      }
      if (parsedRecord.type === 'object') {
        const keysRaw = parsedRecord.keys;
        const keys = Array.isArray(keysRaw) ? keysRaw : [];
        if (keys.length === 0) {
          return 'Dati letti correttamente';
        }
        return `Informazioni lette correttamente (${keys.length} campi disponibili)`;
      }
      const value = String(parsedRecord.value || '');
      if (value.length > 100) {
        return value.substring(0, 100) + '...';
      }
      return value || 'Dati letti correttamente';
    }
    if (toolName === 'tavily_search') {
      return 'Ricerca completata con successo';
    }
    if (toolName === 'search_disciplinari') {
      if (content.includes('No disciplinari')) {
        return 'Nessun disciplinare trovato per questo prodotto';
      }
      return 'Disciplinari trovati e analizzati';
    }
    if (toolName === 'extract_label_data') {
      return "Dati dell'etichetta estratti correttamente";
    }
    if (toolName === 'bdf_search_product_doses') {
      const parsedRecord = asRecord(parsePossiblyJson(content));
      if (parsedRecord?.error) {
        const errorText = String(parsedRecord.error);
        if (errorText.includes('doses.map is not a function')) {
          return 'Formato risposta BDF inatteso: continuo con fallback.';
        }
        return 'BDF non disponibile - uso fonti alternative';
      }
      return 'Dosi ufficiali trovate nella Banca Dati Fitofarmaci';
    }
    if (toolName === 'bdf_search_products_by_adversity') {
      const parsedRecord = asRecord(parsePossiblyJson(content));
      if (parsedRecord?.error) {
        return 'BDF non disponibile - uso fonti alternative';
      }
      return 'Prodotti autorizzati trovati nella Banca Dati Fitofarmaci';
    }
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  } catch {
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }
}

/**
 * Streaming function for approving an action.
 * Uses streamEvents() for real-time token streaming.
 */
export async function* streamApproveJobVerificationAction(
  threadId: string,
  userId?: string,
  modelName?: ChatModel,
): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const app = createJobVerificationAgentApp({
    modelName: modelName || 'gpt-4o',
    userId,
  });

  const config = { configurable: { thread_id: threadId } };

  try {
    // Use streamEvents for real-time streaming
    const eventStream = app.streamEvents(null, {
      ...config,
      version: 'v2',
      recursionLimit: DEFAULT_RECURSION_LIMIT,
    });

    for await (const event of eventStream) {
      const eventType = event.event;
      const eventData = event.data;

      // Handle LLM token streaming
      if (eventType === 'on_llm_stream') {
        const chunk = eventData?.chunk;
        if (chunk instanceof AIMessageChunk && chunk.content) {
          const content = chunk.content.toString();
          if (content) {
            yield {
              type: 'token',
              content: content,
            };
          }
        }
      }

      // Handle tool events
      if (eventType === 'on_tool_start') {
        const toolName = event.name || 'unknown';
        const toolInput = asRecord(parsePossiblyJson(eventData?.input || {})) ?? {};
        yield {
          type: 'tool_start',
          toolCall: { name: toolName, args: toolInput },
          thinking: getToolThinkingMessage(toolName, toolInput),
        };
      }

      if (eventType === 'on_tool_end') {
        const toolName = event.name || 'unknown';
        const output = eventData?.output;
        const content = typeof output === 'string' ? output : JSON.stringify(output);
        const resultSummary = getToolResultSummary(toolName, content);

        yield {
          type: 'tool_result',
          toolResult: {
            name: toolName,
            result: content.length > 500 ? content.substring(0, 500) + '...' : content,
            summary: resultSummary,
          },
          thinking: resultSummary || 'Informazioni raccolte con successo',
        };
      }
    }

    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;

    if (state.requiresHumanInput && state.pendingAction) {
      yield {
        type: 'requires_modification_approval',
        pendingAction: state.pendingAction,
      };
      return {
        status: 'REQUIRES_MODIFICATION_APPROVAL',
        pendingAction: state.pendingAction,
      };
    }

    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    yield {
      type: 'complete',
      sources: state.sources,
      response: {
        status: 'COMPLETED',
        message: state.finalAnswer || lastMessage?.content?.toString() || 'Azione completata.',
        sources: state.sources,
      },
    };

    return {
      status: 'COMPLETED',
      message: state.finalAnswer || lastMessage?.content?.toString() || 'Azione completata.',
      sources: state.sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    yield {
      type: 'error',
      error: errorMessage,
    };
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}
