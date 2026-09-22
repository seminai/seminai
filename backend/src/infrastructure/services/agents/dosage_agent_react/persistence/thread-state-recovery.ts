import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { MessageRole } from '@prisma/client';
import { prisma } from '../../../../repositories/Prisma';
import { loadTasksFromDb } from '../tools/task-planner.tool';
import { updateWorkingMemory } from '../working-memory';
import type { DosageReactState } from '../type/state';
import type { Questionnaire } from '../type/questionnaire';

interface HydratableAgentApp {
  getState: (config: {
    configurable: { thread_id: string };
  }) => Promise<{ values: DosageReactState }>;
  updateState: (
    config: { configurable: { thread_id: string } },
    update: Partial<DosageReactState> | Record<string, unknown>,
    asNode?: string,
  ) => Promise<unknown>;
}

interface RestoreOptions {
  readonly includeTrailingUserMessage?: boolean;
}

interface PersistedMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly pendingToolCalls: unknown;
  readonly metadata: unknown;
}

function convertMessage(message: {
  role: MessageRole;
  content: string;
  pendingToolCalls: unknown;
  metadata: unknown;
}): BaseMessage {
  if (message.role === MessageRole.USER) {
    return new HumanMessage(message.content);
  }
  if (message.role === MessageRole.ASSISTANT) {
    const aiMessage = new AIMessage(message.content);
    if (Array.isArray(message.pendingToolCalls)) {
      (aiMessage as AIMessage & { tool_calls?: unknown }).tool_calls = message.pendingToolCalls;
    }
    return aiMessage;
  }
  if (message.role === MessageRole.SYSTEM) {
    return new SystemMessage(message.content);
  }
  if (message.role === MessageRole.TOOL) {
    const metadata = (message.metadata ?? {}) as { toolCallId?: string; name?: string };
    return new ToolMessage({
      content: message.content,
      tool_call_id: metadata.toolCallId ?? 'unknown',
      name: metadata.name,
    });
  }
  return new HumanMessage(message.content);
}

function extractPendingQuestionnaire(
  messages: Array<{
    role: MessageRole;
    metadata: unknown;
  }>,
): Questionnaire | undefined {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== MessageRole.ASSISTANT) {
    return undefined;
  }
  if (!lastMessage.metadata || typeof lastMessage.metadata !== 'object') {
    return undefined;
  }
  const metadata = lastMessage.metadata as { questionnaire?: Questionnaire };
  return metadata.questionnaire;
}

function buildPendingAction(
  messages: BaseMessage[],
): DosageReactState['pendingAction'] | undefined {
  const lastMessage = messages[messages.length - 1] as
    | (AIMessage & {
        tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
      })
    | undefined;
  const toolCall = lastMessage?.tool_calls?.[0];
  if (!toolCall) {
    return undefined;
  }
  return {
    tool: toolCall.name,
    args: toolCall.args,
    description: `Esecuzione ${toolCall.name}`,
    requiresApproval: true,
  };
}

function buildLastToolCalls(messages: BaseMessage[]): string[] {
  return messages.flatMap((message) => {
    if (!(message instanceof AIMessage)) {
      return [];
    }
    const toolCalls = (message as AIMessage & { tool_calls?: Array<{ name: string }> }).tool_calls;
    return Array.isArray(toolCalls) ? toolCalls.map((toolCall) => toolCall.name) : [];
  });
}

function getRecoverableMessages(
  messages: readonly PersistedMessage[],
  options?: RestoreOptions,
): readonly PersistedMessage[] {
  if (options?.includeTrailingUserMessage) {
    return messages;
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== MessageRole.USER) {
    return messages;
  }
  return messages.slice(0, -1);
}

function messageContentToText(message: BaseMessage | undefined): string {
  if (!message) return '';
  const content = message.content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function shouldRestoreThreadState(
  currentMessages: readonly BaseMessage[],
  persistedMessages: readonly PersistedMessage[],
): boolean {
  if (persistedMessages.length === 0) return false;
  if (currentMessages.length === 0) return true;
  if (persistedMessages.length > currentMessages.length) return true;
  const lastCurrent = messageContentToText(currentMessages[currentMessages.length - 1]).trim();
  const lastPersisted = persistedMessages[persistedMessages.length - 1]?.content.trim() ?? '';
  return lastPersisted.length > 0 && lastCurrent !== lastPersisted;
}

export async function restoreThreadStateFromDatabase(
  app: HydratableAgentApp,
  threadId: string,
  options?: RestoreOptions,
): Promise<boolean> {
  const config = { configurable: { thread_id: threadId } };
  const currentState = await app.getState(config).catch(() => undefined);

  const chat = await prisma.chat.findUnique({
    where: { threadId },
    include: {
      messages: {
        orderBy: { sequence: 'asc' },
        select: {
          role: true,
          content: true,
          pendingToolCalls: true,
          metadata: true,
        },
      },
    },
  });
  if (!chat || chat.messages.length === 0) {
    return false;
  }

  const recoverableMessages = getRecoverableMessages(chat.messages, options);
  const currentMessages = currentState?.values.messages ?? [];
  if (!shouldRestoreThreadState(currentMessages, recoverableMessages)) {
    return false;
  }
  const restoredMessages = recoverableMessages.map(convertMessage);
  const lastToolCalls = buildLastToolCalls(restoredMessages);
  const taskList = await loadTasksFromDb(threadId);
  const pendingQuestionnaire = extractPendingQuestionnaire([...recoverableMessages]);
  if (pendingQuestionnaire) {
    updateWorkingMemory(threadId, { pendingQuestionnaire });
  }

  await app.updateState(
    config,
    {
      messages: restoredMessages,
      taskList,
      lastToolCalls,
      loopCounter: lastToolCalls.length,
      pendingAction: buildPendingAction(restoredMessages),
    },
    buildPendingAction(restoredMessages) ? 'agent' : undefined,
  );
  return true;
}
