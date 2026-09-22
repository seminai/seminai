/**
 * Types for the structured questionnaire HITL pattern.
 * Used by agents that need to present structured questions with predefined
 * options to the user, similar to Claude Code's AskUserQuestion.
 *
 * Originally defined in dosage_agent_react — extracted here so any agent
 * can reuse the same contract.
 */

export type QuestionType = 'single_select' | 'multi_select' | 'text';

export interface QuestionOption {
  /** Display label shown to the user (e.g., "Vigneto Nord - 12.5 ha (Vite)") */
  readonly label: string;
  /** Value sent back when selected (e.g., production unit ID) */
  readonly value: string;
  /** Optional description/detail for the option */
  readonly description?: string;
}

export interface Question {
  /** Unique identifier for this question (used to match answers) */
  readonly id: string;
  /** The question text */
  readonly question: string;
  /** Type of input expected */
  readonly type: QuestionType;
  /** Predefined options (required for single_select and multi_select) */
  readonly options?: ReadonlyArray<QuestionOption>;
  /** Whether an answer is required */
  readonly required: boolean;
  /** Placeholder text for text inputs */
  readonly placeholder?: string;
}

export interface Questionnaire {
  /** Title of the questionnaire */
  readonly title: string;
  /** Optional description/context */
  readonly description?: string;
  /** The questions to present */
  readonly questions: ReadonlyArray<Question>;
}
