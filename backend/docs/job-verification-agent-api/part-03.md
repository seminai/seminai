# Job Verification Agent API — Part 3

[Back to the guide index](../JOB_VERIFICATION_AGENT_API.md)

```typescript
import { useCallback, useState } from 'react';

interface JobVerificationMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  reasoning?: string;
  pendingAction?: PendingAction;
}

interface SourceCitation {
  url: string;
  title: string;
  description: string;
}

interface PendingAction {
  type: 'tool_call' | 'job_modification';
  tool?: string;
  args?: Record<string, unknown>;
  description: string;
}

export function useJobVerificationAgent(threadId: string, jobs: JobWithAssignmentDTO[]) {
  const [messages, setMessages] = useState<JobVerificationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [currentSources, setCurrentSources] = useState<SourceCitation[]>([]);

  const sendMessage = useCallback(
    async (message: string, metadata?: MessageMetadata) => {
      setIsLoading(true);
      setMessages((prev) => [...prev, { role: 'user', content: message }]);

      try {
        const response = await fetch('/api/job-verification-agent/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            threadId,
            jobs,
            message,
            metadata,
          }),
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
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'token':
                  assistantContent += data.content;
                  // Aggiorna UI in tempo reale
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

                case 'sources_update':
                  setCurrentSources(data.sources);
                  break;

                case 'requires_approval':
                case 'requires_modification_approval':
                  setPendingAction(
                    data.pendingAction || {
                      type: 'tool_call',
                      tool: data.toolCall?.name,
                      args: data.toolCall?.args,
                      description: `Esecuzione ${data.toolCall?.name}`,
                    },
                  );
                  break;

                case 'complete':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.sources = data.sources;
                      lastMsg.reasoning = data.response?.reasoning;
                    }
                    return updated;
                  });
                  break;

                case 'error':
                  console.error('Agent error:', data.error);
                  break;
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to send message:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [threadId, jobs],
  );

  const approveAction = useCallback(
    async (modification?: { jobId: string; field: string; newValue: unknown }) => {
      setIsLoading(true);
      setPendingAction(null);

      try {
        const response = await fetch('/api/job-verification-agent/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            threadId,
            modification,
          }),
        });

        const data = await response.json();

        if (data.status === 'success') {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.data.message,
              sources: data.data.sources,
            },
          ]);
        }
      } catch (error) {
        console.error('Failed to approve action:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [threadId],
  );

  const rejectAction = useCallback(
    async (reason: string) => {
      setIsLoading(true);
      setPendingAction(null);

      try {
        const response = await fetch('/api/job-verification-agent/reject', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            threadId,
            reason,
          }),
        });

        const data = await response.json();

        if (data.status === 'success') {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.data.message,
            },
          ]);
        }
      } catch (error) {
        console.error('Failed to reject action:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [threadId],
  );

  return {
    messages,
    isLoading,
    pendingAction,
    currentSources,
    sendMessage,
    approveAction,
    rejectAction,
  };
}
```

### Componente UI Example
