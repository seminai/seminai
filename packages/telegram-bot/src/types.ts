import { Context, SessionFlavor } from 'grammy';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  credits: number;
}

export interface Company {
  id: string;
  name: string;
  vatNumber: string;
  fiscalCode: string;
  city?: string;
  address?: string;
}

export interface Field {
  id: string;
  name: string;
  region?: string;
  city?: string;
  gisHa?: number;
  cropName?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  city?: string;
}

export interface ProductionUnit {
  id: string;
  name: string;
  cropName?: string;
  variety?: string;
  areaHa?: number;
}

export type ChatResponseStatus = 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR' | 'CANCELLED';

export type QuestionType = 'single_select' | 'multi_select' | 'text';

export interface QuestionOption {
  readonly label: string;
  readonly value: string;
  readonly description?: string;
}

export interface Question {
  readonly id: string;
  readonly question: string;
  readonly type: QuestionType;
  readonly options?: readonly QuestionOption[];
  readonly required: boolean;
  readonly placeholder?: string;
}

export interface Questionnaire {
  readonly title: string;
  readonly description?: string;
  readonly questions: readonly Question[];
}

export interface ProposalSummary {
  readonly [key: string]: unknown;
}

export interface ChatResponse {
  status: ChatResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly id?: string;
    readonly description?: string;
    readonly riskLevel?: string;
    readonly riskScore?: number;
    readonly riskReason?: string;
  }>;
  proposalSummary?: ProposalSummary;
  sources?: Array<{
    readonly url: string;
    readonly title: string;
    readonly fragment?: string;
  }>;
  questionnaire?: Questionnaire;
  error?: string;
}

export interface SessionData {
  token?: string;
  userId?: string;
  userName?: string;
  selectedCompanyId?: string;
  selectedCompanyName?: string;
  chatThreadId?: string;
  pendingApproval: boolean;
  lastActivity: number;
  // OTP verification
  pendingPhone?: string;
  pendingOtp?: boolean;
  userEmail?: string;
  // Cache for companies (to avoid exceeding Telegram callback data limit)
  companiesCache?: Record<string, string>; // id -> name
}

export type BotContext = Context & SessionFlavor<SessionData>;
