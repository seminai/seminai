# Dosage ReAct Agent — Frontend Integration Guide — Part 2

[Back to the guide index](../dosage-react-agent-frontend-integration.md)

```json
{
  "status": "success",
  "data": [
    {
      "id": "chat-abc",
      "threadId": "thread-001",
      "category": "DOSAGE_AGENT",
      "modelName": "gpt-4o-mini",
      "createdAt": "2025-03-15T10:00:00.000Z",
      "updatedAt": "2025-03-15T10:05:00.000Z",
      "lastMessage": {
        "content": "Il prodotto Prolectus 50 WG è stato revocato...",
        "role": "ASSISTANT",
        "createdAt": "2025-03-15T10:05:00.000Z"
      }
    }
  ]
}
```

---

## Tipi SSE Events

Ogni evento nello stream ha un campo `type` che indica il contenuto:

| `type`              | Descrizione                      | Campi utili                                 |
| ------------------- | -------------------------------- | ------------------------------------------- |
| `token`             | Chunk di testo della risposta    | `content` — testo da appendere              |
| `tool_call`         | Agente sta chiamando un tool     | `toolCall.name`, `toolCall.args`            |
| `tool_result`       | Risultato di un tool (opzionale) | `content`                                   |
| `requires_approval` | Azione distruttiva in attesa     | `toolCall` — tool che richiede approvazione |
| `loop_warning`      | Troppi tool call consecutivi     | `content` — messaggio warning               |
| `complete`          | Fine stream, con costi           | `response`, `sources`, `cost`               |
| `error`             | Errore durante esecuzione        | `error` — messaggio errore                  |

---

## Implementazione Frontend (TypeScript/React)

### 1. Tipo Eventi

```typescript
interface StreamEvent {
  type:
    | 'token'
    | 'tool_call'
    | 'tool_result'
    | 'requires_approval'
    | 'loop_warning'
    | 'complete'
    | 'error';
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  sources?: Array<{ title: string; url: string; fragment: string }>;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    tavilyCalls: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
  };
  response?: {
    status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';
    message?: string;
    sources?: Array<{ title: string; url: string; fragment: string }>;
  };
  error?: string;
}
```

### 2. Hook `useAgentChat`
