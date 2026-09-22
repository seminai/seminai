// ---------------------------------------------------------------------------
// Mock the socket emitter so the four tools can be observed without an active
// Socket.IO server. We capture every emitFormPatch call so individual tests
// can assert on the payload.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock the socket emitter so the four tools can be observed without an active
// Socket.IO server. We capture every emitFormPatch call so individual tests
// can assert on the payload.
// ---------------------------------------------------------------------------
import type { FormPatchPayload } from '../infrastructure/services/agents/dosage_agent_react/type/events';

const capturedPatches: FormPatchPayload[] = [];

jest.mock(
  '../infrastructure/services/agents/dosage_agent_react/socket/chat-socket-emitter',
  () => ({
    setGlobalSocketIO: jest.fn(),
    getGlobalSocketIO: jest.fn(() => null),
    createChatEmitter: jest.fn(() => ({
      emitStreamEvent: jest.fn(),
      emitStreamEventRaw: jest.fn(),
      emitTaskUpdate: jest.fn(),
      emitMemoryUpdate: jest.fn(),
      emitSubagentProgress: jest.fn(),
      emitExtractionProgress: jest.fn(),
      emitExtractionComplete: jest.fn(),
      emitExtractionFailed: jest.fn(),
      emitExtractionReviewPresented: jest.fn(),
      emitExtractionReviewSaved: jest.fn(),
      emitExtractionReviewCancelled: jest.fn(),
      emitExtractionArchived: jest.fn(),
      emitPipelineProgress: jest.fn(),
      emitFollowUpSuggestions: jest.fn(),
      emitOuterLoopAlert: jest.fn(),
      emitFormPatch: jest.fn((payload: FormPatchPayload) => capturedPatches.push(payload)),
    })),
  }),
);

import { createProposeSetUnitFieldsTool, createProposeAddUnitTool, createProposeRemoveUnitTool, createProposeMoveAllocationTool } from '../infrastructure/services/agents/dosage_agent_react/tools';
import { streamReactAgent } from '../infrastructure/services/agents/dosage_agent_react/streaming';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react/type/events';

jest.setTimeout(180_000);

beforeEach(() => {
  capturedPatches.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFormSnapshot(): Record<string, unknown> {
  return {
    companyId: 'company-test-1',
    units: [
      {
        id: 'pu-0',
        name: 'UP Nord',
        cropName: 'Mais',
        cropType: 'Cereale',
        variety: '',
        allocations: [
          { fieldId: 'field-A', areaHa: 2.5, fieldName: 'Campo A' },
          { fieldId: 'field-B', areaHa: 1.5, fieldName: 'Campo B' },
        ],
      },
      {
        id: 'pu-1',
        name: 'UP Sud',
        cropName: 'Soia',
        cropType: 'Leguminosa',
        variety: '',
        allocations: [{ fieldId: 'field-C', areaHa: 3.0, fieldName: 'Campo C' }],
      },
    ],
  };
}
void (() => buildFormSnapshot);

async function collectStream(
  options: Parameters<typeof streamReactAgent>[0],
): Promise<readonly StreamEvent[]> {
  const events: StreamEvent[] = [];
  const stream = streamReactAgent(options);
  for await (const event of stream) events.push(event);
  return events;
}
void (() => collectStream);

function findToolCallsByName(
  events: readonly StreamEvent[],
  toolName: string,
): readonly StreamEvent[] {
  return events.filter((e) => e.type === 'tool_call' && e.toolCall?.name === toolName);
}
void (() => findToolCallsByName);
// ---------------------------------------------------------------------------
// SECTION 1 — Direct invocation (no LLM)
// ---------------------------------------------------------------------------

describe('propose_* tools — Direct invocation', () => {
  describe('propose_set_unit_fields', () => {
    it('emits a set_unit_fields patch with only allowed keys', async () => {
      const tool = createProposeSetUnitFieldsTool('test-direct-set');
      const result = await tool.invoke({
        unitIndex: 0,
        fields: {
          cropName: 'Pomodoro',
          occupazione: 'Seminativo',
          destinazioneDiUso: 'Mercato locale',
          // intentionally invalid key — must be filtered out
          unknownField: 'ignore-me',
        },
      });

      expect(capturedPatches).toHaveLength(1);
      const patch = capturedPatches[0];
      expect(patch.action).toBe('set_unit_fields');
      if (patch.action !== 'set_unit_fields') throw new Error('discriminator narrowing failed');
      expect(patch.unitIndex).toBe(0);
      expect(patch.fields).toEqual({
        cropName: 'Pomodoro',
        occupazione: 'Seminativo',
        destinazioneDiUso: 'Mercato locale',
      });
      expect(patch.fields).not.toHaveProperty('unknownField');

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.unitIndex).toBe(0);
      expect(parsed.appliedFields).toEqual(
        expect.arrayContaining(['cropName', 'occupazione', 'destinazioneDiUso']),
      );
    });

    it('returns success even when no allowed keys are present', async () => {
      const tool = createProposeSetUnitFieldsTool('test-direct-set-empty');
      const result = await tool.invoke({ unitIndex: 1, fields: { foo: 'bar' } });
      expect(capturedPatches).toHaveLength(1);
      const parsed = JSON.parse(result as string);
      expect(parsed.appliedFields).toEqual([]);
    });
  });

  describe('propose_add_unit', () => {
    it('emits an add_unit patch with optional partial unit', async () => {
      const tool = createProposeAddUnitTool('test-direct-add');
      await tool.invoke({ unit: { cropName: 'Insalata', protocoll: 'Biologico' } });
      expect(capturedPatches).toHaveLength(1);
      const patch = capturedPatches[0];
      expect(patch.action).toBe('add_unit');
      if (patch.action !== 'add_unit') throw new Error('discriminator narrowing failed');
      expect(patch.unit).toEqual({ cropName: 'Insalata', protocoll: 'Biologico' });
    });

    it('emits an add_unit patch with undefined unit when none is provided', async () => {
      const tool = createProposeAddUnitTool('test-direct-add-empty');
      await tool.invoke({});
      expect(capturedPatches).toHaveLength(1);
      const patch = capturedPatches[0];
      expect(patch.action).toBe('add_unit');
      if (patch.action !== 'add_unit') throw new Error('discriminator narrowing failed');
      expect(patch.unit).toBeUndefined();
    });
  });

  describe('propose_remove_unit', () => {
    it('emits a remove_unit patch with the requested index', async () => {
      const tool = createProposeRemoveUnitTool('test-direct-remove');
      await tool.invoke({ unitIndex: 2 });
      expect(capturedPatches).toHaveLength(1);
      const patch = capturedPatches[0];
      expect(patch.action).toBe('remove_unit');
      if (patch.action !== 'remove_unit') throw new Error('discriminator narrowing failed');
      expect(patch.unitIndex).toBe(2);
    });
  });

  describe('propose_move_allocation', () => {
    it('emits a move_allocation patch with all indices preserved', async () => {
      const tool = createProposeMoveAllocationTool('test-direct-move');
      await tool.invoke({
        fromUnitIndex: 0,
        allocationIndex: 1,
        toUnitIndex: 1,
        toAllocationIndex: 0,
      });
      expect(capturedPatches).toHaveLength(1);
      const patch = capturedPatches[0];
      expect(patch.action).toBe('move_allocation');
      if (patch.action !== 'move_allocation') throw new Error('discriminator narrowing failed');
      expect(patch.fromUnitIndex).toBe(0);
      expect(patch.allocationIndex).toBe(1);
      expect(patch.toUnitIndex).toBe(1);
      expect(patch.toAllocationIndex).toBe(0);
    });

    it('omits toAllocationIndex when not provided', async () => {
      const tool = createProposeMoveAllocationTool('test-direct-move-default');
      await tool.invoke({ fromUnitIndex: 0, allocationIndex: 0, toUnitIndex: 1 });
      expect(capturedPatches).toHaveLength(1);
      const patch = capturedPatches[0];
      if (patch.action !== 'move_allocation') throw new Error('discriminator narrowing failed');
      expect(patch.toAllocationIndex).toBeUndefined();
    });
  });
});
