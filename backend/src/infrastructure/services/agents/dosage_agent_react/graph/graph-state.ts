/**
 * LangGraph state annotation for the Dosage ReAct Agent.
 * Defines the shape and reducers for all state fields in the graph.
 */
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { DosageReactState, AgentTaskItem } from '../type/state';
import { SourceCitation } from '../../chat_dosage_agent/types';

export const DosageReactAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  pendingAction: Annotation<
    DosageReactState['pendingAction'],
    DosageReactState['pendingAction'] | null
  >({
    /**
     * `null` is the explicit "clear" sentinel emitted by nodes that complete a
     * turn without further pending tool calls (see nodes.ts) and by
     * approveAction/rejectAction after a graph resume settles. `undefined`
     * means "no change" so the previous value sticks — needed so partial
     * updates from unrelated nodes don't accidentally wipe pendingAction.
     * The ValueType stays `T | undefined` so consumers never observe null.
     */
    reducer: (prev, next) => {
      if (next === null) return undefined;
      return next ?? prev;
    },
    default: () => undefined,
  }),
  sources: Annotation<SourceCitation[] | undefined>({
    reducer: (_x, y) => y ?? _x,
    default: () => undefined,
  }),
  loopCounter: Annotation<number>({
    reducer: (_x, y) => y,
    default: () => 0,
  }),
  lastToolCalls: Annotation<string[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  lastToolCallRecords: Annotation<DosageReactState['lastToolCallRecords']>({
    reducer: (_x, y) => y ?? _x,
    default: () => undefined,
  }),
  selectedModel: Annotation<DosageReactState['selectedModel']>({
    reducer: (_x, y) => y ?? _x,
    default: () => undefined,
  }),
  taskList: Annotation<AgentTaskItem[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
});
