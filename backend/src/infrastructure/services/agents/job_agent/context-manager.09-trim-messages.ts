import { BaseMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTrimMessages(this: ContextManagerContext, messages: BaseMessage[]): BaseMessage[] {
    const totalTokens = this.countTotalTokens(messages);

    if (totalTokens <= this.config.maxContextTokens) {
      return messages;
    }

    console.log(
      `[CONTEXT_MANAGER] Trimming messages: ${totalTokens} tokens -> target ${this.config.targetTokensAfterTrim}`,
    );

    // Separate messages by type
    const systemMessages = messages.filter((m) => m instanceof SystemMessage);
    const nonSystemMessages = messages.filter((m) => !(m instanceof SystemMessage));

    // Calculate available tokens for non-system messages
    const systemTokens = this.countTotalTokens(systemMessages);
    const availableTokens = this.config.targetTokensAfterTrim - systemTokens;

    // Always keep recent messages
    const recentMessages = nonSystemMessages.slice(-this.config.minRecentMessages);
    const olderMessages = nonSystemMessages.slice(0, -this.config.minRecentMessages);

    const recentTokens = this.countTotalTokens(recentMessages);
    const availableForOlder = availableTokens - recentTokens;

    // Process older messages - truncate tool results and summarize
    const processedOlder: BaseMessage[] = [];
    let olderTokens = 0;

    for (const msg of olderMessages) {
      // Truncate tool messages aggressively
      if (msg instanceof ToolMessage) {
        const truncated = this.createTruncatedToolMessage(msg);
        const truncatedTokens = this.countMessageTokens(truncated);

        if (olderTokens + truncatedTokens <= availableForOlder) {
          processedOlder.push(truncated);
          olderTokens += truncatedTokens;
        }
        // Skip if doesn't fit
        continue;
      }

      // Truncate AI messages with long content
      if (msg instanceof AIMessage) {
        const msgTokens = this.countMessageTokens(msg);
        if (msgTokens > 1000) {
          const truncated = this.truncateAIMessage(msg);
          const truncatedTokens = this.countMessageTokens(truncated);
          if (olderTokens + truncatedTokens <= availableForOlder) {
            processedOlder.push(truncated);
            olderTokens += truncatedTokens;
          }
          continue;
        }
      }

      // Keep other messages if they fit
      const msgTokens = this.countMessageTokens(msg);
      if (olderTokens + msgTokens <= availableForOlder) {
        processedOlder.push(msg);
        olderTokens += msgTokens;
      }
    }

    // Reconstruct message array
    const trimmedMessages = [...systemMessages, ...processedOlder, ...recentMessages];

    const finalTokens = this.countTotalTokens(trimmedMessages);
    console.log(
      `[CONTEXT_MANAGER] Trimmed: ${messages.length} -> ${trimmedMessages.length} messages, ${totalTokens} -> ${finalTokens} tokens`,
    );

    return trimmedMessages;
  }
