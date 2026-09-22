/**
 * Integration tests for ChatSocketEmitter.
 * Tests event emission mapping without full Express+Socket.IO server.
 *
 * npm run test:integration -- --testPathPattern socket-dual-channel
 */
import { ChatSocketEmitter } from '../infrastructure/services/agents/dosage_agent_react/socket/chat-socket-emitter';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react/type/events';
import type { Server as SocketServer } from 'socket.io';

const THREAD_ID = 'thread-abc123';

function createMockSocketIO() {
  const emittedEvents: Array<{ room: string; event: string; data: unknown }> = [];
  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, data: unknown) => {
        emittedEvents.push({ room, event, data });
      },
    }),
  };
  return { mockIo: mockIo as unknown as SocketServer, emittedEvents };
}

describe('ChatSocketEmitter integration', () => {
  it('tool_call emitted as agent:tool_call with toolName', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    const event: StreamEvent = {
      type: 'tool_call',
      toolCall: { name: 'search_documents', args: { q: 'test' }, id: 'tc-1' },
    };
    emitter.emitStreamEvent(event);
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].event).toBe('agent:tool_call');
    expect((emittedEvents[0].data as Record<string, unknown>).toolName).toBe('search_documents');
  });

  it('token events NOT emitted', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitStreamEvent({ type: 'token', content: 'hello' });
    expect(emittedEvents).toHaveLength(0);
  });

  it('complete emitted as agent:complete', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitStreamEvent({ type: 'complete', content: 'Done' });
    expect(emittedEvents[0].event).toBe('agent:complete');
    expect((emittedEvents[0].data as Record<string, unknown>).type).toBe('complete');
  });

  it('error emitted as agent:error', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitStreamEvent({ type: 'error', error: 'Something failed' });
    expect(emittedEvents[0].event).toBe('agent:error');
    expect((emittedEvents[0].data as Record<string, unknown>).error).toBe('Something failed');
  });

  it('emitMemoryUpdate emits agent:memory_update with key and preview', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitMemoryUpdate('matchedProducts', '{"products":[1,2,3]}');
    expect(emittedEvents[0].event).toBe('agent:memory_update');
    const data = emittedEvents[0].data as Record<string, unknown>;
    expect(data.key).toBe('matchedProducts');
    expect(data.preview).toBe('{"products":[1,2,3]}');
  });

  it('emitTaskUpdate emits agent:task_update with taskList', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    const taskList = [
      { id: 't1', content: 'Step 1', status: 'done' },
      { id: 't2', content: 'Step 2', status: 'pending' },
    ];
    emitter.emitTaskUpdate(taskList);
    expect(emittedEvents[0].event).toBe('agent:task_update');
    expect((emittedEvents[0].data as Record<string, unknown>).taskList).toEqual(taskList);
  });

  it('emitSubagentProgress emits with subAgentId, progress, step', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitSubagentProgress('sub-1', 0.5, 'Extracting data');
    expect(emittedEvents[0].event).toBe('agent:subagent_progress');
    const data = emittedEvents[0].data as Record<string, unknown>;
    expect(data.subAgentId).toBe('sub-1');
    expect(data.progress).toBe(0.5);
    expect(data.step).toBe('Extracting data');
  });

  it('emitOuterLoopAlert emits with triggerId, type, title', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitOuterLoopAlert({
      triggerId: 'tr-123',
      type: 'phenological',
      title: 'Fioritura vite',
      payload: { crop: 'vite' },
    });
    expect(emittedEvents[0].event).toBe('agent:outer_loop_alert');
    const data = emittedEvents[0].data as Record<string, unknown>;
    expect(data.triggerId).toBe('tr-123');
    expect(data.type).toBe('phenological');
    expect(data.title).toBe('Fioritura vite');
  });

  it('all events target room chat:<threadId>', () => {
    const { mockIo, emittedEvents } = createMockSocketIO();
    const emitter = new ChatSocketEmitter(mockIo, THREAD_ID);
    emitter.emitStreamEvent({ type: 'tool_call', toolCall: { name: 'x', args: {} } });
    emitter.emitMemoryUpdate('k', 'v');
    emitter.emitTaskUpdate([]);
    const expectedRoom = `chat:${THREAD_ID}`;
    emittedEvents.forEach((e) => expect(e.room).toBe(expectedRoom));
  });
});
