import {
  AIMessage,
  BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { task } from '@langchain/langgraph';

type StoredChatMessage = ReturnType<BaseMessage['toDict']>;

export interface SerializedAIMessage {
  readonly id?: string;
  readonly name?: string;
  readonly content: AIMessage['content'];
  readonly additional_kwargs: AIMessage['additional_kwargs'];
  readonly response_metadata: AIMessage['response_metadata'];
  readonly tool_calls?: AIMessage['tool_calls'];
  readonly invalid_tool_calls?: AIMessage['invalid_tool_calls'];
  readonly usage_metadata?: AIMessage['usage_metadata'];
}

/**
 * Creates a durable LangGraph task wrapper around an async function.
 */
export function createDurableTask<InputT, OutputT>(
  name: string,
  fn: (input: InputT) => Promise<OutputT>,
): (input: InputT) => Promise<OutputT> {
  // LangGraph 1.2.x narrows task callback typing in a way that does not
  // preserve already-typed async function variables, even though the runtime
  // API still supports them as documented.
  const durable = task(name, fn as never) as (input: InputT) => Promise<OutputT>;
  return async (input: InputT): Promise<OutputT> => {
    try {
      return await durable(input);
    } catch (error) {
      if (isMissingLangGraphTaskRuntime(error)) {
        return fn(input);
      }
      throw error;
    }
  };
}

function isMissingLangGraphTaskRuntime(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return (
    error.message.includes("Cannot read properties of undefined (reading 'configurable')") &&
    (error.stack?.includes('@langchain/langgraph') ?? false)
  );
}

/**
 * Serializes chat messages into LangChain stored-message format.
 */
export function serializeMessages(messages: BaseMessage[]): StoredChatMessage[] {
  return mapChatMessagesToStoredMessages(messages);
}

/**
 * Restores chat messages from LangChain stored-message format.
 */
export function deserializeMessages(messages: StoredChatMessage[]): BaseMessage[] {
  return mapStoredMessagesToChatMessages(messages);
}

/**
 * Converts an AIMessage into a plain serializable object for durable tasks.
 */
export function serializeAIMessage(message: AIMessage): SerializedAIMessage {
  return {
    id: message.id,
    name: message.name,
    content: message.content,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    tool_calls: message.tool_calls,
    invalid_tool_calls: message.invalid_tool_calls,
    usage_metadata: message.usage_metadata,
  };
}

/**
 * Restores an AIMessage from a plain serializable representation.
 */
export function deserializeAIMessage(message: SerializedAIMessage): AIMessage {
  return new AIMessage(message);
}

/**
 * Wraps a DynamicStructuredTool so its execution is replay-safe via LangGraph tasks.
 */
export function wrapToolWithDurableTask(tool: DynamicStructuredTool): DynamicStructuredTool {
  const originalFunc = tool.func.bind(tool);
  const executeToolTask = createDurableTask<unknown, unknown>(
    `dosage_react_tool_${tool.name}`,
    async (input) => originalFunc(input),
  );
  const wrapped = new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    responseFormat: tool.responseFormat,
    returnDirect: tool.returnDirect,
    verboseParsingErrors: tool.verboseParsingErrors,
    func: executeToolTask,
  });
  wrapped.extras = tool.extras;
  wrapped.defaultConfig = tool.defaultConfig;
  return wrapped;
}
