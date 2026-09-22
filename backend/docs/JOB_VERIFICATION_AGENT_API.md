# Job Verification Agent API

Agente di chat con streaming per la verifica dei job agricoli non verificati. Implementa human-in-the-loop per approvazione di modifiche ai dati.

## Indice

- [Overview](#overview)
- [Endpoint](#endpoint)
- [Input Format](#input-format)
- [Stream Events](#stream-events)
- [Esempi cURL](#esempi-curl)
- [Integrazione Frontend](#integrazione-frontend)
- [Gestione Modifiche Job](#gestione-modifiche-job)
- [Fonti e Citazioni](#fonti-e-citazioni)

---

## Overview

L'agente permette di:

1. Ricevere una lista di job non verificati (`JobWithAssignmentDTO[]`)
2. Rispondere a domande sui job
3. Cercare informazioni su etichette, disciplinari, e web
4. Proporre modifiche ai job (con approvazione utente)
5. Mantenere memoria della conversazione

**Workflow dell'agente:**

1. Ottimizza la richiesta utente
2. Crea un piano di task
3. Esegue i task chiamando i tool appropriati
4. Genera ragionamento e risposta
5. Verifica se risponde alla domanda
6. Fornisce risposta con fonti

---

## Endpoint

| Metodo | Endpoint                                  | Descrizione                      |
| ------ | ----------------------------------------- | -------------------------------- |
| POST   | `/job-verification-agent/stream`          | Chat con streaming SSE           |
| POST   | `/job-verification-agent/message`         | Chat senza streaming             |
| POST   | `/job-verification-agent/approve`         | Approva azione/modifica pendente |
| POST   | `/job-verification-agent/reject`          | Rifiuta azione con motivo        |
| GET    | `/job-verification-agent/state/:threadId` | Stato conversazione              |

---

## Input Format

### Request Body (stream/message)

```typescript
interface JobVerificationRequest {
  threadId: string; // UUID univoco per la conversazione
  jobs: JobWithAssignmentDTO[]; // Array di job da verificare
  message: string; // Messaggio utente
  metadata?: {
    // Allegati opzionali
    images?: string[]; // URL immagini
    links?: string[]; // Link esterni
    pdfs?: string[]; // URL PDF
  };
  modelName?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo';
  temperature?: number; // Default: 0
}
```

### JobWithAssignmentDTO Structure

```typescript
interface JobWithAssignmentDTO {
  job: {
    id: string;
    jobId: string | null;
    productionUnitId: string;
    dateOfOpeation: Date;
    isVerified: boolean;
    conformityChecked: boolean;
    category: 'TREATMENT' | 'FERTILIZATION' | 'IRRIGATION' | ...;
    quantity: number;
    unitOfMeasureQuantity: string;
    avversity: string | null;
    note: string | null;
    // ... altri campi
  };
  productionUnit: {
    id: string;
    name: string;
    cropName: string;
    cropType: string;
  };
  products: Array<{
    id: string;
    name: string;
    registrationNumber: string | null;
  }>;
  fields: Array<{
    id: string;
    name: string;
  }>;
  company: {
    id: string;
    name: string;
  };
  machine: {
    id: string;
    name: string;
    identifier: string;
  } | null;
}
```

---

## Stream Events

L'endpoint `/stream` emette eventi SSE con i seguenti tipi:

```typescript
type StreamEventType =
  | 'token' // Token di testo incrementale
  | 'reasoning' // Ragionamento dell'agente
  | 'thinking' // Pensiero live dell'agente
  | 'tool_call' // Chiamata a un tool
  | 'tool_start' // Tool in esecuzione (con thinking)
  | 'tool_result' // Risultato di un tool (con summary)
  | 'task_update' // Aggiornamento lista task
  | 'task_progress' // Cambio stato task
  | 'sources_update' // Nuove fonti trovate
  | 'data_inspection' // Ispezione dati job
  | 'complete' // Risposta completata
  | 'requires_approval' // Richiede approvazione tool
  | 'requires_modification_approval' // Richiede approvazione modifica job
  | 'error'; // Errore

interface StreamEvent {
  type: StreamEventType;
  content?: string; // Per 'token'
  reasoning?: string; // Per 'reasoning'
  thinking?: string; // Per 'thinking', 'tool_start', 'task_progress'
  toolCall?: {
    // Per 'tool_call', 'tool_start', 'requires_approval'
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  toolResult?: {
    // Per 'tool_result'
    name: string;
    result: string;
    summary?: string; // Riassunto leggibile del risultato
  };
  dataInspection?: {
    // Per 'data_inspection'
    path: string;
    jobId: string;
    summary: string;
  };
  tasks?: AgentTask[]; // Per 'task_update', 'task_progress'
  currentTaskId?: string; // Task corrente
  sources?: SourceCitation[]; // Per 'sources_update', 'complete'
  pendingAction?: PendingAction; // Per 'requires_modification_approval'
  cost?: {
    // Per 'complete'
    inputTokens: number;
    outputTokens: number;
    tavilyCalls: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
  };
  error?: string; // Per 'error'
  response?: AgentResponse; // Per 'complete'
}
```

> **Nota**: Per una guida completa sull'integrazione dello streaming live del "pensiero" dell'agente, vedi [JOB_VERIFICATION_AGENT_STREAMING.md](./JOB_VERIFICATION_AGENT_STREAMING.md)

---

## Esempi cURL

### 1. Chat con Streaming

```bash
curl -X POST "https://api.example.com/job-verification-agent/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "jobs": [
      {
        "job": {
          "id": "job-123",
          "dateOfOpeation": "2024-01-15T10:00:00Z",
          "isVerified": false,
          "conformityChecked": false,
          "category": "TREATMENT",
          "quantity": 2.5,
          "unitOfMeasureQuantity": "L/ha",
          "avversity": "Peronospora"
        },
        "productionUnit": {
          "id": "pu-1",
          "name": "Vigneto Nord",
          "cropName": "Vite",
          "cropType": "da vino"
        },
        "products": [
          {
            "id": "prod-1",
            "name": "Ridomil Gold MZ",
            "registrationNumber": "12345"
          }
        ],
        "fields": [{ "id": "f-1", "name": "Campo A" }],
        "company": { "id": "c-1", "name": "Azienda Agricola Rossi" },
        "machine": null
      }
    ],
    "message": "Verifica se il dosaggio di 2.5 L/ha di Ridomil Gold MZ è corretto per la vite contro la peronospora"
  }'
```

**Risposta (SSE stream):**

```
data: {"type":"task_update","tasks":[{"id":"task_1","description":"Verificare dosaggio Ridomil Gold MZ su vite","status":"pending"}]}

data: {"type":"tool_call","toolCall":{"name":"extract_label_data","args":{"productName":"Ridomil Gold MZ","registrationNumber":"12345"}}}

data: {"type":"sources_update","sources":[{"url":"https://sian.it/etichette/12345.pdf","title":"Etichetta Ridomil Gold MZ","description":"Etichetta ufficiale del prodotto"}]}

data: {"type":"token","content":"Ho verificato l'etichetta del prodotto Ridomil Gold MZ. "}

data: {"type":"token","content":"Il dosaggio consigliato per la vite contro la peronospora è di 2-2.5 kg/ha. "}

data: {"type":"reasoning","reasoning":"Analisi completata per 1 job. Fonti consultate: 1"}

data: {"type":"complete","sources":[{"url":"https://sian.it/etichette/12345.pdf","title":"Etichetta Ridomil Gold MZ","description":"Dosaggio vite: 2-2.5 kg/ha"}],"cost":{"inputTokens":1250,"outputTokens":180,"tavilyCalls":0,"totalCostUsd":0.0045,"costWithMarginUsd":0.0054},"response":{"status":"COMPLETED","message":"Il dosaggio di 2.5 L/ha indicato sembra corretto...","sources":[...]}}

```

### 2. Chat senza Streaming

```bash
curl -X POST "https://api.example.com/job-verification-agent/message" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "jobs": [...],
    "message": "Qual è l'\''intervallo di sicurezza per questo trattamento?"
  }'
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "L'intervallo di sicurezza (tempo di carenza) per Ridomil Gold MZ sulla vite è di 28 giorni dalla raccolta.",
    "reasoning": "Informazione estratta dall'etichetta ufficiale del prodotto.",
    "tasks": [
      {
        "id": "task_1",
        "description": "Cercare intervallo di sicurezza nell'etichetta",
        "status": "completed"
      }
    ],
    "sources": [
      {
        "url": "https://sian.it/etichette/12345.pdf",
        "title": "Etichetta Ridomil Gold MZ",
        "description": "Intervallo di sicurezza vite: 28 giorni"
      }
    ]
  }
}
```

### 3. Richiesta di Modifica (Richiede Approvazione)

```bash
curl -X POST "https://api.example.com/job-verification-agent/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "jobs": [...],
    "message": "Modifica la quantità del primo job da 2.5 a 2.0 L/ha"
  }'
```

**Risposta (SSE stream):**

```
data: {"type":"tool_call","toolCall":{"name":"propose_job_modification","args":{"jobId":"job-123","field":"quantity","oldValue":"2.5","newValue":"2.0","reason":"Richiesta utente"}}}

data: {"type":"requires_modification_approval","pendingAction":{"type":"job_modification","tool":"propose_job_modification","args":{"jobId":"job-123","field":"quantity","oldValue":"2.5","newValue":"2.0","reason":"Richiesta utente"},"description":"Modifica proposta: quantity da 2.5 a 2.0"}}

```

### 4. Approvare una Modifica

```bash
curl -X POST "https://api.example.com/job-verification-agent/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "modification": {
      "jobId": "job-123",
      "field": "quantity",
      "newValue": 2.0
    }
  }'
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "La modifica è stata applicata con successo. Il campo 'quantity' del job è stato aggiornato da 2.5 a 2.0. Nota: il job è stato marcato come conformityChecked=false.",
    "sources": []
  }
}
```

### 5. Rifiutare un'Azione

```bash
curl -X POST "https://api.example.com/job-verification-agent/reject" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "Preferisco mantenere il dosaggio originale"
  }'
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "Ho preso nota che preferisci mantenere il dosaggio originale di 2.5 L/ha. Posso aiutarti con altro?",
    "sources": []
  }
}
```

### 6. Ottenere Stato Conversazione

```bash
curl -X GET "https://api.example.com/job-verification-agent/state/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <TOKEN>"
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "messages": [...],
    "jobs": [...],
    "tasks": [...],
    "sources": [...],
    "reasoning": "...",
    "requiresHumanInput": false
  }
}
```

---

## Integrazione Frontend

### React/TypeScript Example

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

```tsx
function JobVerificationChat({ jobs }: { jobs: JobWithAssignmentDTO[] }) {
  const threadId = useMemo(() => crypto.randomUUID(), []);
  const {
    messages,
    isLoading,
    pendingAction,
    currentSources,
    sendMessage,
    approveAction,
    rejectAction,
  } = useJobVerificationAgent(threadId, jobs);

  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              msg.role === 'user' ? 'bg-blue-100 ml-8' : 'bg-gray-100 mr-8'
            }`}
          >
            <p>{msg.content}</p>

            {/* Sources */}
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-sm font-medium">Fonti:</p>
                <ul className="text-sm">
                  {msg.sources.map((source, j) => (
                    <li key={j}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {source.title}
                      </a>
                      <span className="text-gray-500"> - {source.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="animate-spin">...</span>
            L'agente sta elaborando...
          </div>
        )}
      </div>

      {/* Pending Action Approval */}
      {pendingAction && (
        <div className="p-4 bg-yellow-50 border-t">
          <p className="font-medium">Azione in attesa di approvazione:</p>
          <p className="text-sm text-gray-600">{pendingAction.description}</p>

          {pendingAction.type === 'job_modification' && (
            <p className="text-sm text-orange-600 mt-1">
              Attenzione: questa modifica imposterà conformityChecked=false
            </p>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                if (pendingAction.type === 'job_modification' && pendingAction.args) {
                  approveAction({
                    jobId: pendingAction.args.jobId as string,
                    field: pendingAction.args.field as string,
                    newValue: pendingAction.args.newValue,
                  });
                } else {
                  approveAction();
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Approva
            </button>
            <button
              onClick={() => {
                const reason = prompt('Motivo del rifiuto:');
                if (reason) rejectAction(reason);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Rifiuta
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Fai una domanda sui job..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={isLoading || !!pendingAction}
          />
          <button
            type="submit"
            disabled={isLoading || !!pendingAction || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            Invia
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## Gestione Modifiche Job

Quando l'utente chiede di modificare un job:

1. L'agente chiama `propose_job_modification` tool
2. L'API restituisce `requires_modification_approval` event
3. Il frontend mostra UI di approvazione
4. L'utente approva o rifiuta

**Se approvato:**

- La modifica viene applicata al job nel database
- `conformityChecked` viene impostato a `false`
- La history del job viene aggiornata con i dettagli della modifica

**Campi modificabili:**

- `quantity` - Quantità prodotto
- `unitOfMeasureQuantity` - Unità di misura
- `avversity` - Avversità target
- `note` - Note aggiuntive
- `modeOfApplication` - Modalità applicazione
- `treatedSurface` - Superficie trattata
- Altri campi del job...

---

## Fonti e Citazioni

L'agente include sempre le fonti quando usa informazioni esterne:

```typescript
interface SourceCitation {
  url: string; // URL della fonte
  title: string; // Titolo del documento
  description: string; // Breve descrizione/estratto
}
```

**Tipi di fonti:**

- **Etichette**: PDF ufficiali dal SIAN
- **Disciplinari**: Dataset BDF regionali
- **Web**: Risultati Tavily search
- **Documenti indicizzati**: Ricerca semantica Qdrant

---

## Tool Disponibili

| Tool                       | Descrizione                                        |
| -------------------------- | -------------------------------------------------- |
| `tavily_search`            | Ricerca web generale                               |
| `extract_label_data`       | Estrae dati strutturati da etichette fitosanitarie |
| `search_disciplinari`      | Cerca nei disciplinari regionali BDF               |
| `vector_search_documents`  | Ricerca semantica su documenti indicizzati         |
| `get_job_details`          | Ottiene dettagli completi di un job                |
| `propose_job_modification` | Propone una modifica a un job                      |

---

## Error Handling

```typescript
// Evento errore nello stream
{
  "type": "error",
  "error": "Descrizione dell'errore"
}

// Risposta errore non-streaming
{
  "status": "error",
  "message": "Descrizione dell'errore",
  "code": "ERROR_CODE"
}
```

**Codici errore comuni:**

- `USER_NOT_AUTHENTICATED` - Token mancante/invalido
- `INVALID_MESSAGE` - Messaggio vuoto o non valido
- `INVALID_THREAD_ID` - Thread ID mancante
- `INVALID_JOBS` - Array jobs vuoto o non valido
- `AGENT_ERROR` - Errore interno dell'agente
