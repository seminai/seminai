import { VALID_CHAT_MODELS, type ChatModelName } from '../../../llm-model-validation';

/**
 * Allowed chat models for the Dosage ReAct Agent.
 */
export const VALID_REACT_MODELS = VALID_CHAT_MODELS;

export type ReactChatModel = ChatModelName;

export const DEFAULT_REACT_MODEL: ReactChatModel = 'gpt-4o-mini';
