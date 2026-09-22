import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError, SeminaiNotFoundError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const PROPOSE_DOSAGE_PLAN_TOOL_NAME = 'seminai_propose_dosage_plan';
export const CONFIRM_DOSAGE_PLAN_TOOL_NAME = 'seminai_confirm_dosage_plan';
export const REJECT_DOSAGE_PLAN_TOOL_NAME = 'seminai_reject_dosage_plan';
export const GET_PROPOSAL_STATE_TOOL_NAME = 'seminai_get_proposal_state';

const MENTION_TYPES = ['company', 'product', 'field', 'production_unit', 'stock', 'file'] as const;

const mentionSchema = z.object({
  type: z.enum(MENTION_TYPES),
  id: z.string().min(1),
  label: z.string().min(1),
});

/**
 * Response envelope produced by /agent-chat/* REST endpoints.
 * Body shape: { status: 'success', data: AgentResponse }.
 */
interface AgentChatEnvelope {
  status: string;
  data: unknown;
}

function unwrap(envelope: AgentChatEnvelope): unknown {
  return envelope.data ?? envelope;
}

function toErrorResult(err: unknown, context: string): ReturnType<typeof errorContent> {
  if (err instanceof SeminaiNotFoundError) {
    return errorContent(
      `Proposal not found for the given proposalId/threadId during ${context}. ` +
        'Either the proposal was never created, has expired from the agent cache, or belongs to another user.',
    );
  }
  if (err instanceof SeminaiHttpError) {
    return errorContent(`Seminai API error during ${context} (${err.status}): ${err.message}`);
  }
  return errorContent(`Unexpected error during ${context}: ${(err as Error).message}`);
}

// ── propose ──

export const proposeDosagePlanShape = {
  threadId: z
    .string()
    .min(1)
    .describe(
      'Unique conversation/proposal identifier. Reuse the same threadId across follow-up turns; ' +
        'a fresh UUID starts a new proposal. Acts as proposalId for confirm/reject.',
    ),
  message: z
    .string()
    .min(1)
    .describe(
      'Natural-language instruction for the dosage agent (Italian preferred). ' +
        'Example: "Calcola i trattamenti per l\'unità produttiva X con il prodotto Y".',
    ),
  mentions: z
    .array(mentionSchema)
    .optional()
    .describe(
      'Optional structured references to Seminai entities (companies, products, fields, ' +
        'production units, stocks, files) discoverable via seminai_search_mentions.',
    ),
};

export const PROPOSE_DOSAGE_PLAN_TOOL_DESCRIPTION =
  'Submit a request to the Seminai dosage agent. Returns an AgentResponse: when status is ' +
  'REQUIRES_APPROVAL, the response carries pendingToolCalls (with riskLevel/riskScore) and ' +
  'a structured proposalSummary describing exactly what would be created if the proposal is ' +
  'confirmed. Use seminai_confirm_dosage_plan(threadId) to persist, or seminai_reject_dosage_plan ' +
  'to discard. Status COMPLETED means the agent finished without any persistent side effects ' +
  '(read-only answer or finished plan after auto-approval).';

export async function proposeDosagePlanHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof proposeDosagePlanShape>>,
  timeoutMs?: number,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const envelope = await http.post<AgentChatEnvelope>('/agent-chat/message', {
      body: {
        threadId: args.threadId,
        message: args.message,
        mentions: args.mentions,
      },
      timeoutMs,
    });
    return jsonContent(unwrap(envelope));
  } catch (err) {
    return toErrorResult(err, 'propose_dosage_plan');
  }
}

// ── confirm ──

export const confirmDosagePlanShape = {
  proposalId: z
    .string()
    .min(1)
    .describe(
      'Proposal identifier returned by seminai_propose_dosage_plan (same value as threadId). ' +
        'The backend resumes execution from the approval checkpoint; idempotent via internal ' +
        'queueJobId (re-confirming a fulfilled proposal returns the existing jobs).',
    ),
};

export const CONFIRM_DOSAGE_PLAN_TOOL_DESCRIPTION =
  'Approve the pending tool call for a proposal previously created via ' +
  'seminai_propose_dosage_plan and persist its side effects (e.g. create_treatment_jobs). ' +
  'Fails if there is no proposal awaiting approval for the given proposalId.';

export async function confirmDosagePlanHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof confirmDosagePlanShape>>,
  timeoutMs?: number,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const envelope = await http.post<AgentChatEnvelope>('/agent-chat/approve', {
      body: { threadId: args.proposalId },
      timeoutMs,
    });
    return jsonContent(unwrap(envelope));
  } catch (err) {
    return toErrorResult(err, 'confirm_dosage_plan');
  }
}

// ── reject ──

export const rejectDosagePlanShape = {
  proposalId: z
    .string()
    .min(1)
    .describe('Proposal identifier returned by seminai_propose_dosage_plan.'),
  reason: z
    .string()
    .optional()
    .describe(
      'Optional human-readable rejection rationale. Surfaced to the agent so it can adjust ' +
        'subsequent suggestions in the same conversation.',
    ),
};

export const REJECT_DOSAGE_PLAN_TOOL_DESCRIPTION =
  'Reject the pending tool call for a proposal. The agent receives the (optional) reason and ' +
  'is invited to revise. No persistent side effects are produced.';

export async function rejectDosagePlanHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof rejectDosagePlanShape>>,
  timeoutMs?: number,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const envelope = await http.post<AgentChatEnvelope>('/agent-chat/reject', {
      body: { threadId: args.proposalId, reason: args.reason },
      timeoutMs,
    });
    return jsonContent(unwrap(envelope));
  } catch (err) {
    return toErrorResult(err, 'reject_dosage_plan');
  }
}

// ── state ──

export const getProposalStateShape = {
  proposalId: z
    .string()
    .min(1)
    .describe('Proposal identifier (same value as the original threadId).'),
};

export const GET_PROPOSAL_STATE_TOOL_DESCRIPTION =
  'Fetch the current conversation/proposal state for a proposalId. Useful to resume a ' +
  'multi-turn workflow started in a previous session or by another client without replaying ' +
  'the whole history.';

export async function getProposalStateHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof getProposalStateShape>>,
  timeoutMs?: number,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const envelope = await http.get<AgentChatEnvelope>(
      `/agent-chat/state/${encodeURIComponent(args.proposalId)}`,
      { timeoutMs },
    );
    return jsonContent(unwrap(envelope));
  } catch (err) {
    return toErrorResult(err, 'get_proposal_state');
  }
}

// ── registrar ──

export const registerDosageProposalTools: ToolRegistrar = (server, { http, agentTimeoutMs }) => {
  server.tool(
    PROPOSE_DOSAGE_PLAN_TOOL_NAME,
    PROPOSE_DOSAGE_PLAN_TOOL_DESCRIPTION,
    proposeDosagePlanShape,
    (args) => proposeDosagePlanHandler(http, args, agentTimeoutMs),
  );
  server.tool(
    CONFIRM_DOSAGE_PLAN_TOOL_NAME,
    CONFIRM_DOSAGE_PLAN_TOOL_DESCRIPTION,
    confirmDosagePlanShape,
    (args) => confirmDosagePlanHandler(http, args, agentTimeoutMs),
  );
  server.tool(
    REJECT_DOSAGE_PLAN_TOOL_NAME,
    REJECT_DOSAGE_PLAN_TOOL_DESCRIPTION,
    rejectDosagePlanShape,
    (args) => rejectDosagePlanHandler(http, args, agentTimeoutMs),
  );
  server.tool(
    GET_PROPOSAL_STATE_TOOL_NAME,
    GET_PROPOSAL_STATE_TOOL_DESCRIPTION,
    getProposalStateShape,
    (args) => getProposalStateHandler(http, args, agentTimeoutMs),
  );
};
