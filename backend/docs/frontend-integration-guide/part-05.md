# Guida Integrazione Frontend - Field Notes System — Part 5

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  status?: 'sending' | 'thinking' | 'completed' | 'approval_needed';
}

export function FieldNoteChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId] = useState(`thread-${Date.now()}`);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const thinkingBufferRef = useRef('');

  const sendMessage = async (message: string) => {
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setInput('');
    setIsLoading(true);
    thinkingBufferRef.current = '';

    // Add assistant placeholder
    const assistantIndex = messages.length + 1;
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      thinking: '',
      status: 'thinking'
    }]);

    try {
      await fetchEventSource('http://localhost:8081/field-note-agent/stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          threadId: threadId,
          message: message
        }),
        onmessage(event) {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'token':
              // Accumula token del pensiero
              thinkingBufferRef.current += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  thinking: thinkingBufferRef.current
                };
                return updated;
              });
              break;

            case 'tool_call':
              // Mostra quale tool sta usando
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: `🔧 Usando tool: ${data.toolCall.name}...`
                };
                return updated;
              });
              break;

            case 'requires_approval':
              // Richiesta approvazione
              setPendingApproval(data.toolCall);
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: thinkingBufferRef.current,
                  status: 'approval_needed'
                };
                return updated;
              });
              setIsLoading(false);
              break;

            case 'complete':
              // Completato
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: data.response.message || thinkingBufferRef.current,
                  status: 'completed'
                };
                return updated;
              });
              setIsLoading(false);
              break;

            case 'error':
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: `❌ Errore: ${data.error}`,
                  status: 'completed'
                };
                return updated;
              });
              setIsLoading(false);
              break;
          }
        },
        onerror(err) {
          console.error('SSE Error:', err);
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };

  const approve = async () => {
    setPendingApproval(null);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8081/field-note-agent/approve', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threadId })
      });

      const result = await response.json();

      if (result.data.status === 'COMPLETED') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.data.message,
          status: 'completed'
        }]);
        setIsLoading(false);
      } else if (result.data.status === 'REQUIRES_APPROVAL') {
        setPendingApproval(result.data.pendingToolCalls?.[0]);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.data.message,
          status: 'approval_needed'
        }]);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Approve error:', error);
      setIsLoading(false);
    }
  };

  const reject = async (feedback: string) => {
    setPendingApproval(null);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8081/field-note-agent/reject', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          threadId,
          feedback
        })
      });

      const result = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.data.message,
        status: result.data.status === 'REQUIRES_APPROVAL' ? 'approval_needed' : 'completed'
      }]);

      if (result.data.status === 'REQUIRES_APPROVAL') {
        setPendingApproval(result.data.pendingToolCalls?.[0]);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Reject error:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="field-note-chat">
      {/* Messages */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="content">{msg.content}</div>
            {msg.thinking && (
              <div className="thinking">{msg.thinking}</div>
            )}
            {msg.status === 'approval_needed' && (
              <div className="approval-buttons">
                <button onClick={approve}>✅ Approva</button>
                <button onClick={() => {
                  const feedback = prompt('Feedback di correzione:');
                  if (feedback) reject(feedback);
                }}>
                  ❌ Correggi
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage(input)}
          placeholder="Descrivi la tua nota di campo..."
          disabled={isLoading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '⏳' : '📤'} Invia
        </button>
      </div>
    </div>
  );
}
```

### Vue 3 Example - Lista Field Notes
