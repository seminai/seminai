# Job Verification Agent - Live Streaming Guide — Part 2

[Back to the guide index](../JOB_VERIFICATION_AGENT_STREAMING.md)

```typescript
import { useCallback, useState, useRef } from 'react';

interface ThinkingStep {
  id: string;
  type: 'thinking' | 'tool_start' | 'tool_result' | 'data_inspection' | 'task_progress';
  message: string;
  timestamp: Date;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
}

interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export function useJobVerificationAgentLive(threadId: string, jobs: JobWithAssignmentDTO[]) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [currentTasks, setCurrentTasks] = useState<AgentTask[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<SourceCitation[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addThinkingStep = useCallback((step: Omit<ThinkingStep, 'id' | 'timestamp'>) => {
    setThinkingSteps((prev) => [
      ...prev,
      {
        ...step,
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      // Abort previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setThinkingSteps([]); // Reset thinking steps for new message
      setMessages((prev) => [...prev, { role: 'user', content: message }]);

      try {
        const response = await fetch('/api/job-verification-agent/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ threadId, jobs, message }),
          signal: abortControllerRef.current.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                // === EVENTI DI PENSIERO ===
                case 'thinking':
                  addThinkingStep({
                    type: 'thinking',
                    message: event.thinking,
                  });
                  break;

                case 'task_progress':
                  addThinkingStep({
                    type: 'task_progress',
                    message: event.thinking,
                  });
                  break;

                case 'reasoning':
                  addThinkingStep({
                    type: 'thinking',
                    message: event.reasoning,
                  });
                  break;

                // === EVENTI TOOL ===
                case 'tool_start':
                  addThinkingStep({
                    type: 'tool_start',
                    message: event.thinking || `Eseguo ${event.toolCall?.name}...`,
                    toolName: event.toolCall?.name,
                    toolArgs: event.toolCall?.args,
                  });
                  break;

                case 'tool_call':
                  // Compatibilità con vecchio formato
                  if (!thinkingSteps.some((s) => s.toolName === event.toolCall?.name)) {
                    addThinkingStep({
                      type: 'tool_start',
                      message: `Chiamo ${event.toolCall?.name}...`,
                      toolName: event.toolCall?.name,
                      toolArgs: event.toolCall?.args,
                    });
                  }
                  break;

                case 'tool_result':
                  addThinkingStep({
                    type: 'tool_result',
                    message: event.toolResult?.summary || 'Risultato ricevuto',
                    toolName: event.toolResult?.name,
                    toolResult: event.toolResult?.result,
                  });
                  break;

                case 'data_inspection':
                  addThinkingStep({
                    type: 'data_inspection',
                    message: event.dataInspection?.summary || `Leggo ${event.dataInspection?.path}`,
                  });
                  break;

                // === EVENTI TASK ===
                case 'task_update':
                  setCurrentTasks(event.tasks || []);
                  if (event.currentTaskId) {
                    setCurrentTaskId(event.currentTaskId);
                  }
                  break;

                // === EVENTI SOURCES ===
                case 'sources_update':
                  setSources(event.sources || []);
                  break;

                // === TOKEN RISPOSTA ===
                case 'token':
                  assistantContent += event.content || '';
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.content = assistantContent;
                    } else {
                      updated.push({ role: 'assistant', content: assistantContent });
                    }
                    return updated;
                  });
                  break;

                // === COMPLETAMENTO ===
                case 'complete':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.sources = event.sources;
                      lastMsg.cost = event.cost;
                    }
                    return updated;
                  });
                  setSources(event.sources || []);
                  break;

                case 'error':
                  console.error('Agent error:', event.error);
                  addThinkingStep({
                    type: 'thinking',
                    message: `Errore: ${event.error}`,
                  });
                  break;
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Stream error:', error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [threadId, jobs, addThinkingStep],
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    thinkingSteps,
    currentTasks,
    currentTaskId,
    isLoading,
    sources,
    sendMessage,
    cancelRequest,
  };
}
```

---

## Componente UI con Pensiero Live
