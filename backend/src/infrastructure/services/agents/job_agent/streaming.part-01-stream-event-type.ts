import { SourceCitation, AgentResponse, AgentTask, JobVerificationInput, PendingAction } from './types';
import { ChatModel } from './graph';
import { AIMessageChunk } from '@langchain/core/messages';
import { getNodeThinkingMessage } from './streaming.part-04-stream-quick-chat';
import { getHumanReadablePathName, getReasoningSummary, getTaskStatusMessage, getToolResultSummary, getToolThinkingMessage } from './streaming.part-05-get-tool-thinking-message';

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

export function parsePossiblyJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export interface JobStreamRuntime {
  accumulatedContent: string;
  currentTasks: AgentTask[];
  currentSources: SourceCitation[];
  currentNodeName: string;
  lastEmittedThinking: string;
  tavilyCalls: number;
}

export interface JobGraphStreamEvent {
  readonly event: string;
  readonly name?: string;
  readonly data?: {
    readonly chunk?: unknown;
    readonly input?: unknown;
    readonly output?: unknown;
  };
}

export function handleJobGraphStreamEvent(
  event: JobGraphStreamEvent,
  runtime: JobStreamRuntime,
): StreamEvent[] {
  const emitted: StreamEvent[] = [];
  const { event: eventType, name: eventName, data } = event;
  if (eventType === 'on_chain_start' && eventName) {
    const isInternal = eventName.includes('RunnableSequence') || eventName.includes('ChannelWrite');
    if (eventName !== runtime.currentNodeName && !isInternal) {
      runtime.currentNodeName = eventName;
      const thinking = getNodeThinkingMessage(eventName);
      if (thinking && thinking !== runtime.lastEmittedThinking) {
        runtime.lastEmittedThinking = thinking;
        emitted.push({ type: 'thinking', thinking });
      }
    }
  }
  if (eventType === 'on_llm_stream' && data?.chunk instanceof AIMessageChunk) {
    const content = data.chunk.content?.toString() ?? '';
    if (content) {
      runtime.accumulatedContent += content;
      emitted.push({ type: 'token', content });
    }
  }
  if (eventType === 'on_tool_start') {
    const toolName = eventName || 'unknown';
    const initialInput = parsePossiblyJson(data?.input ?? {});
    const nestedInput = asRecord(initialInput)?.input;
    const args = asRecord(parsePossiblyJson(nestedInput ?? initialInput)) ?? {};
    if (toolName === 'tavily_search') runtime.tavilyCalls += 1;
    const thinking = getToolThinkingMessage(toolName, args);
    emitted.push({ type: 'tool_start', toolCall: { name: toolName, args }, thinking });
    if (toolName === 'inspect_job_data' || toolName === 'list_job_paths') {
      const path = typeof args.path === 'string' ? args.path : 'root';
      emitted.push({
        type: 'data_inspection',
        dataInspection: {
          path,
          jobId: typeof args.jobId === 'string' ? args.jobId : '',
          summary:
            toolName === 'inspect_job_data'
              ? `Sto leggendo ${getHumanReadablePathName(path)}`
              : 'Sto esplorando le informazioni disponibili',
        },
      });
    }
    emitted.push({ type: 'tool_call', toolCall: { name: toolName, args } });
  }
  if (eventType === 'on_tool_end') {
    const toolName = eventName || 'unknown';
    const output = data?.output;
    const content = typeof output === 'string' ? output : JSON.stringify(output);
    const summary = getToolResultSummary(toolName, content);
    emitted.push({
      type: 'tool_result',
      toolResult: {
        name: toolName,
        result: content.length > 500 ? `${content.substring(0, 500)}...` : content,
        summary,
      },
      thinking: summary || 'Informazioni raccolte con successo',
    });
  }
  if (eventType === 'on_chain_end') {
    const output = asRecord(data?.output);
    if (!output) return emitted;
    const tasks = Array.isArray(output.tasks) ? (output.tasks as AgentTask[]) : null;
    if (tasks && JSON.stringify(tasks) !== JSON.stringify(runtime.currentTasks)) {
      const previousTasks = runtime.currentTasks;
      runtime.currentTasks = tasks;
      const currentTaskId = typeof output.currentTaskId === 'string' ? output.currentTaskId : undefined;
      emitted.push({ type: 'task_update', tasks, currentTaskId });
      for (const task of tasks) {
        const previous = previousTasks.find((candidate) => candidate.id === task.id);
        if (previous && previous.status !== task.status) {
          emitted.push({
            type: 'task_progress',
            thinking: getTaskStatusMessage(task.status, task.description),
            tasks,
            currentTaskId: task.id,
          });
        }
      }
    }
    const sources = Array.isArray(output.sources) ? (output.sources as SourceCitation[]) : null;
    if (sources && sources.length > runtime.currentSources.length) {
      const added = sources.length - runtime.currentSources.length;
      runtime.currentSources = sources;
      emitted.push({
        type: 'sources_update',
        sources,
        thinking: added === 1 ? '📚 Ho trovato una nuova fonte di informazioni' : `📚 Ho trovato ${added} nuove fonti di informazioni`,
      });
    }
    if (typeof output.reasoning === 'string' && output.reasoning) {
      emitted.push({
        type: 'reasoning',
        reasoning: output.reasoning,
        thinking: getReasoningSummary(output.reasoning),
      });
    }
  }
  return emitted;
}
