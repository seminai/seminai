# Dosage ReAct Agent — Frontend Integration Guide — Part 3

[Back to the guide index](../dosage-react-agent-frontend-integration.md)

```typescript
import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  status?: 'streaming' | 'completed' | 'requires_approval' | 'error';
}

interface UseAgentChatOptions {
  baseUrl: string;
  token: string;
  modelName?: string;
  jobId?: string;
  workspaceId?: string;
}

export function useAgentChat(options: UseAgentChatOptions) {
  const { baseUrl, token, modelName = 'gpt-4o-mini', jobId, workspaceId } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<StreamEvent | null>(null);
  const threadIdRef = useRef(uuidv4());
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      // Add user message
      const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: userMessage,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Prepare assistant message placeholder
      const assistantMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        status: 'streaming',
        toolCalls: [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(`${baseUrl}/agent-chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            threadId: threadIdRef.current,
            message: userMessage,
            modelName,
            jobId,
            workspaceId,
          }),
          signal: abortController.signal,
        });

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            const event: StreamEvent = JSON.parse(jsonStr);

            switch (event.type) {
              case 'token':
                // Append text token
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + (event.content || '') }
                      : m,
                  ),
                );
                break;

              case 'tool_call':
                // Show tool being called
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            {
                              name: event.toolCall!.name,
                              args: event.toolCall!.args,
                            },
                          ],
                        }
                      : m,
                  ),
                );
                break;

              case 'requires_approval':
                setPendingApproval(event);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, status: 'requires_approval' } : m,
                  ),
                );
                break;

              case 'complete':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          content: event.response?.message || m.content,
                          status: 'completed',
                        }
                      : m,
                  ),
                );
                break;

              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: event.error || 'Errore', status: 'error' }
                      : m,
                  ),
                );
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: 'Errore di connessione', status: 'error' }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [baseUrl, token, modelName, jobId, workspaceId],
  );

  const approve = useCallback(async () => {
    setPendingApproval(null);
    const res = await fetch(`${baseUrl}/agent-chat/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        threadId: threadIdRef.current,
        modelName,
      }),
    });
    const data = await res.json();

    setMessages((prev) => [
      ...prev,
      {
        id: uuidv4(),
        role: 'assistant',
        content: data.data?.message || 'Azione approvata.',
        status: data.data?.status === 'REQUIRES_APPROVAL' ? 'requires_approval' : 'completed',
      },
    ]);

    return data.data;
  }, [baseUrl, token, modelName]);

  const reject = useCallback(
    async (reason: string) => {
      setPendingApproval(null);
      const res = await fetch(`${baseUrl}/agent-chat/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          reason,
          modelName,
        }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          content: data.data?.message || 'Azione rifiutata.',
          status: 'completed',
        },
      ]);

      return data.data;
    },
    [baseUrl, token, modelName],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const newConversation = useCallback(() => {
    threadIdRef.current = uuidv4();
    setMessages([]);
    setPendingApproval(null);
  }, []);

  return {
    messages,
    isStreaming,
    pendingApproval,
    threadId: threadIdRef.current,
    sendMessage,
    approve,
    reject,
    stop,
    newConversation,
  };
}
```

### 3. Componente Chat
