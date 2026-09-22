import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { extractProfessionalContext } from './memory/user-profile-fact-extractor';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTextContent(message: BaseMessage): string {
  const content = message.content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function isQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return text.includes('?') || normalized.startsWith('di cosa ti occupi');
}

function isSameQuestion(left: string, right: string): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (normalizedLeft.length < 12 || normalizedRight.length < 12) return false;
  return normalizedLeft === normalizedRight;
}

function buildAcknowledgement(userAnswer: string): string {
  const professionalContext = extractProfessionalContext(userAnswer);
  if (professionalContext) {
    return `Hai ragione, me lo avevi gia detto: ti occupi di ${professionalContext}. Tengo questo dato come contesto e non te lo richiedero.`;
  }
  return 'Hai ragione, avevi gia risposto. Tengo conto del messaggio precedente e proseguo da li senza ripetere la stessa domanda.';
}

/**
 * Replaces duplicated assistant questions with an acknowledgement grounded in
 * the user's intervening answer.
 */
export function guardAgainstDuplicateQuestion(
  messages: readonly BaseMessage[],
  assistantText: string,
): string {
  if (!isQuestion(assistantText)) return assistantText;
  const previousMessages = messages.slice(0, -1);
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (message instanceof AIMessage && isSameQuestion(getTextContent(message), assistantText)) {
      const answer = previousMessages
        .slice(index + 1)
        .find((candidate): candidate is HumanMessage => candidate instanceof HumanMessage);
      return answer ? buildAcknowledgement(getTextContent(answer)) : assistantText;
    }
  }
  return assistantText;
}
