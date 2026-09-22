import type { SeminaiHttpClient, RequestOptions } from '../client/http';
import { SeminaiHttpError, SeminaiNotFoundError } from '../client/http-errors';
import {
  confirmDosagePlanHandler,
  getProposalStateHandler,
  proposeDosagePlanHandler,
  rejectDosagePlanHandler,
} from '../tools/dosage-proposal';

interface RecordedCall {
  path: string;
  options: RequestOptions | undefined;
}

interface PerVerbHandlers {
  get?: Record<string, () => Promise<unknown>>;
  post?: Record<string, () => Promise<unknown>>;
}

function makeHttpStub(per: PerVerbHandlers): {
  client: SeminaiHttpClient;
  getCalls: RecordedCall[];
  postCalls: RecordedCall[];
} {
  const getCalls: RecordedCall[] = [];
  const postCalls: RecordedCall[] = [];
  const get = jest.fn().mockImplementation((path: string, options?: RequestOptions) => {
    getCalls.push({ path, options });
    const handler = per.get?.[path];
    if (!handler) return Promise.reject(new Error(`Unexpected GET ${path}`));
    return handler();
  });
  const post = jest.fn().mockImplementation((path: string, options?: RequestOptions) => {
    postCalls.push({ path, options });
    const handler = per.post?.[path];
    if (!handler) return Promise.reject(new Error(`Unexpected POST ${path}`));
    return handler();
  });
  const client = {
    get,
    post,
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as SeminaiHttpClient;
  return { client, getCalls, postCalls };
}

function readBody(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

describe('dosage-proposal tools', () => {
  describe('proposeDosagePlanHandler', () => {
    it('POSTs to /agent-chat/message with threadId, message, mentions and unwraps the envelope', async () => {
      const agentResponse = {
        status: 'REQUIRES_APPROVAL',
        message: 'Riepilogo trattamenti...',
        pendingToolCalls: [
          {
            name: 'create_treatment_jobs',
            args: { persist: true },
            riskLevel: 'medium',
            riskScore: 35,
            riskReason: 'base score for create_treatment_jobs',
          },
        ],
        proposalSummary: {
          tool: 'create_treatment_jobs',
          totalJobs: 3,
          unitsCount: 2,
          units: [],
          complianceViolationsCount: 0,
          hasComplianceViolations: false,
        },
      };
      const { client, postCalls } = makeHttpStub({
        post: {
          '/agent-chat/message': () => Promise.resolve({ status: 'success', data: agentResponse }),
        },
      });

      const result = await proposeDosagePlanHandler(client, {
        threadId: 'thread-xyz',
        message: 'Calcola trattamenti per UP X',
        mentions: [{ type: 'product', id: 'prod-1', label: 'Karate Zeon' }],
      });

      expect(postCalls).toHaveLength(1);
      expect(postCalls[0].path).toBe('/agent-chat/message');
      expect(postCalls[0].options?.body).toEqual({
        threadId: 'thread-xyz',
        message: 'Calcola trattamenti per UP X',
        mentions: [{ type: 'product', id: 'prod-1', label: 'Karate Zeon' }],
      });
      expect(readBody(result)).toEqual(agentResponse);
      expect('isError' in result ? result.isError : false).toBe(false);
    });

    it('returns errorContent with the underlying status when the API surfaces a 5xx', async () => {
      const { client } = makeHttpStub({
        post: {
          '/agent-chat/message': () =>
            Promise.reject(new SeminaiHttpError(500, 'Internal server error', null)),
        },
      });

      const result = await proposeDosagePlanHandler(client, {
        threadId: 't1',
        message: 'go',
      });

      expect('isError' in result && result.isError).toBe(true);
      expect(result.content[0].text).toContain('propose_dosage_plan');
      expect(result.content[0].text).toContain('500');
    });
  });

  describe('confirmDosagePlanHandler', () => {
    it('POSTs to /agent-chat/approve mapping proposalId → threadId', async () => {
      const completed = { status: 'COMPLETED', message: 'Job creati: 3' };
      const { client, postCalls } = makeHttpStub({
        post: {
          '/agent-chat/approve': () => Promise.resolve({ status: 'success', data: completed }),
        },
      });

      const result = await confirmDosagePlanHandler(client, { proposalId: 'thread-xyz' });

      expect(postCalls[0].path).toBe('/agent-chat/approve');
      expect(postCalls[0].options?.body).toEqual({ threadId: 'thread-xyz' });
      expect(readBody(result)).toEqual(completed);
    });

    it('returns a dedicated proposal-not-found message on 404', async () => {
      const { client } = makeHttpStub({
        post: {
          '/agent-chat/approve': () =>
            Promise.reject(new SeminaiNotFoundError({ code: 'NOT_FOUND' })),
        },
      });

      const result = await confirmDosagePlanHandler(client, { proposalId: 'missing' });

      expect('isError' in result && result.isError).toBe(true);
      expect(result.content[0].text).toContain('Proposal not found');
      expect(result.content[0].text).toContain('confirm_dosage_plan');
    });
  });

  describe('rejectDosagePlanHandler', () => {
    it('POSTs to /agent-chat/reject forwarding the optional reason', async () => {
      const rejected = { status: 'COMPLETED', message: 'Rejected' };
      const { client, postCalls } = makeHttpStub({
        post: {
          '/agent-chat/reject': () => Promise.resolve({ status: 'success', data: rejected }),
        },
      });

      const result = await rejectDosagePlanHandler(client, {
        proposalId: 'thread-xyz',
        reason: 'Dose troppo alta per il prodotto X',
      });

      expect(postCalls[0].path).toBe('/agent-chat/reject');
      expect(postCalls[0].options?.body).toEqual({
        threadId: 'thread-xyz',
        reason: 'Dose troppo alta per il prodotto X',
      });
      expect(readBody(result)).toEqual(rejected);
    });
  });

  describe('getProposalStateHandler', () => {
    it('GETs /agent-chat/state/:proposalId with URI-encoded proposalId', async () => {
      const state = { status: 'REQUIRES_APPROVAL' };
      const { client, getCalls } = makeHttpStub({
        get: {
          '/agent-chat/state/thread%20with%20space': () =>
            Promise.resolve({ status: 'success', data: state }),
        },
      });

      const result = await getProposalStateHandler(client, {
        proposalId: 'thread with space',
      });

      expect(getCalls[0].path).toBe('/agent-chat/state/thread%20with%20space');
      expect(readBody(result)).toEqual(state);
    });
  });

  describe('agent-timeout propagation', () => {
    it('proposeDosagePlanHandler forwards timeoutMs to the HTTP client', async () => {
      const { client, postCalls } = makeHttpStub({
        post: {
          '/agent-chat/message': () =>
            Promise.resolve({ status: 'success', data: { status: 'COMPLETED' } }),
        },
      });
      await proposeDosagePlanHandler(client, { threadId: 't', message: 'm' }, 180_000);
      expect(postCalls[0].options?.timeoutMs).toBe(180_000);
    });

    it('confirmDosagePlanHandler forwards timeoutMs to the HTTP client', async () => {
      const { client, postCalls } = makeHttpStub({
        post: {
          '/agent-chat/approve': () =>
            Promise.resolve({ status: 'success', data: { status: 'COMPLETED' } }),
        },
      });
      await confirmDosagePlanHandler(client, { proposalId: 't' }, 180_000);
      expect(postCalls[0].options?.timeoutMs).toBe(180_000);
    });

    it('rejectDosagePlanHandler forwards timeoutMs to the HTTP client', async () => {
      const { client, postCalls } = makeHttpStub({
        post: {
          '/agent-chat/reject': () =>
            Promise.resolve({ status: 'success', data: { status: 'COMPLETED' } }),
        },
      });
      await rejectDosagePlanHandler(client, { proposalId: 't' }, 180_000);
      expect(postCalls[0].options?.timeoutMs).toBe(180_000);
    });

    it('getProposalStateHandler forwards timeoutMs to the HTTP client', async () => {
      const { client, getCalls } = makeHttpStub({
        get: {
          '/agent-chat/state/t': () => Promise.resolve({ status: 'success', data: {} }),
        },
      });
      await getProposalStateHandler(client, { proposalId: 't' }, 180_000);
      expect(getCalls[0].options?.timeoutMs).toBe(180_000);
    });
  });
});
