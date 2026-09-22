import { DynamicStructuredTool } from '@langchain/core/tools';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { wrapToolWithDurableTask } from '../infrastructure/services/agents/dosage_agent_react/graph/durable-execution';

const TestState = Annotation.Root({
  outputs: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});

describe('dosage react durable execution', () => {
  it('does not rerun a completed tool task when a node replays after failure', async () => {
    let toolCallCount = 0;
    let hasFailedOnce = false;
    const durableTool = wrapToolWithDurableTask(
      new DynamicStructuredTool({
        name: 'persist_value',
        description: 'Persists a test value',
        schema: z.object({
          value: z.string(),
        }),
        func: async ({ value }) => {
          toolCallCount++;
          return JSON.stringify({ value });
        },
      }),
    );
    const graph = new StateGraph(TestState)
      .addNode('unstable', async () => {
        const output = await durableTool.invoke({ value: 'ok' });
        if (!hasFailedOnce) {
          hasFailedOnce = true;
          throw new Error('boom');
        }
        return { outputs: [output as string] };
      })
      .addEdge(START, 'unstable')
      .addEdge('unstable', END)
      .compile({
        checkpointer: new MemorySaver(),
      });
    const config = { configurable: { thread_id: 'durable-thread' } };

    await expect(graph.invoke({}, config)).rejects.toThrow('boom');

    const result = await graph.invoke(null as unknown as Record<string, never>, config);

    expect(result.outputs).toEqual([JSON.stringify({ value: 'ok' })]);
    expect(toolCallCount).toBe(1);
  });
});
