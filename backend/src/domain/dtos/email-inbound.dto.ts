import { type AgentResponseStatus } from '@prisma/client';

/** Single attachment parsed from an inbound email webhook payload. */
export interface ParsedAttachmentDto {
  readonly fileName: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
  readonly sizeBytes: number;
}

/** Provider-agnostic shape of a parsed inbound email. */
export interface ParsedInboundEmailDto {
  readonly messageId: string;
  readonly fromAddress: string;
  readonly fromName?: string;
  readonly toAddresses: ReadonlyArray<string>;
  readonly subject: string;
  readonly bodyText: string;
  readonly bodyHtml?: string;
  readonly rawHeaders: Record<string, string>;
  readonly inReplyTo?: string;
  readonly references?: ReadonlyArray<string>;
  readonly attachments: ReadonlyArray<ParsedAttachmentDto>;
}

/** Outcome of dispatching an ingestion to dosage_agent_react. */
export interface DispatchToAgentResultDto {
  readonly threadId: string;
  readonly chatId: string;
  readonly agentStatus: AgentResponseStatus;
}

/** Disambiguation candidate when sender belongs to multiple companies. */
export interface DisambiguationCandidateDto {
  readonly index: number;
  readonly companyId: string;
  readonly companyName: string;
}

/** Resolution result for an inbound email sender lookup. */
export type SenderResolutionDto =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'no_companies'; readonly userId: string }
  | { readonly kind: 'opt_out'; readonly userId: string }
  | { readonly kind: 'single'; readonly userId: string; readonly companyId: string }
  | {
      readonly kind: 'multiple';
      readonly userId: string;
      readonly candidates: ReadonlyArray<DisambiguationCandidateDto>;
    };

/** Limits enforced on inbound emails. */
export interface EmailIngestionLimitsDto {
  readonly maxAttachments: number;
  readonly maxTotalBytes: number;
  readonly maxPerFileBytes: number;
  readonly maxCompaniesInDisambiguation: number;
}
