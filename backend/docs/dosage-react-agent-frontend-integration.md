# Dosage ReAct Agent — Frontend Integration Guide

Base URL: `https://<your-domain>` (es. `http://localhost:8081`)

Auth: Bearer token JWT nell'header `Authorization: Bearer <token>` oppure cookie `auth_token`.

---

## Architettura

```
Frontend                          Backend
┌──────────────┐   SSE stream    ┌──────────────────────┐
│  Chat UI     │ ◄──────────────►│  POST /agent-chat/   │
│              │   JSON events   │  stream               │
│  - Input     │                 │                       │
│  - Messages  │   JSON          │  POST /agent-chat/    │
│  - Tools     │ ◄──────────────►│  message              │
│  - Approval  │                 │                       │
│              │   JSON          │  POST /agent-chat/    │
│              │ ────────────────►│  approve / reject     │
└──────────────┘                 └──────────────────────┘
```

Il flusso standard:

1. Utente invia messaggio → `POST /agent-chat/stream`
2. Backend risponde con SSE stream di eventi
3. Se l'agente richiede approvazione → frontend mostra dialog
4. Utente approva/rifiuta → `POST /agent-chat/approve` o `reject`

---

## Endpoints

### 1. Stream (SSE) — Endpoint principale

```
POST /agent-chat/stream
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "threadId": "thread-abc123",
  "message": "Il Captano a 1.5 kg/ha su melo è conforme al disciplinare EMR?",
  "modelName": "gpt-4o-mini",
  "temperature": 0,
  "jobId": "job-xyz",
  "workspaceId": "ws-123"
}
```

| Campo         | Tipo   | Required | Note                                                                                                                                                                                                                   |
| ------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threadId`    | string | **Si**   | ID univoco conversazione. Generare con UUID lato frontend.                                                                                                                                                             |
| `message`     | string | **Si**   | Messaggio utente (non vuoto)                                                                                                                                                                                           |
| `modelName`   | string | No       | `gpt-4o` (default), `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo`                                                                                                                                             |
| `temperature` | number | No       | 0-2 (default: 0)                                                                                                                                                                                                       |
| `jobId`       | string | No       | Contesto job per RAG sulle operazioni. **Forza l'agente agricolo (dosage)** indipendentemente dal kind del workspace.                                                                                                  |
| `workspaceId` | string | Sì\*     | ID del workspace attivo (`useWorkspace().activeWorkspaceId`). **Instrada la chat all'agente del kind del workspace** (AGRICULTURAL → dosage, MANUFACTURING → manufacture) e fornisce contesto per le regole aziendali. |

> **\* `workspaceId` e routing per workspace kind.** Quando il backend ha `WORKSPACE_KIND_ROUTING=true`,
> `workspaceId` è **obbligatorio**: se assente la chiamata risponde `400 WORKSPACE_ID_REQUIRED`. Con il flag
> disattivo (default) `workspaceId` resta opzionale e la chat usa sempre l'agente dosage (comportamento
> legacy). Il frontend invia sempre `useWorkspace().activeWorkspaceId`. La chat job-scoped (con `jobId`) resta
> sull'agente dosage. Vedi `MANUFACTURE_REACT_AGENT_ARCHITETTURA.md` per l'agente manifatturiero.

**Response:** Stream SSE (`text/event-stream`)

#### curl — Stream

```bash
curl -N -X POST 'http://localhost:8081/agent-chat/stream' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -d '{
    "threadId": "thread-001",
    "message": "Il prodotto Prolectus 50 WG (reg 15549) è stato revocato?",
    "modelName": "gpt-4o-mini"
  }'
```

**Output SSE (ogni riga `data: {...}`):**

```
data: {"type":"tool_call","toolCall":{"name":"check_product_revoked","args":{"registrationNumber":"15549","productName":"Prolectus 50 WG"},"id":"call_abc123"}}

data: {"type":"token","content":"Il prodotto **Prolectus 50 WG**"}

data: {"type":"token","content":" (numero di registrazione 15549)"}

data: {"type":"token","content":" è stato **revocato** il 16 gennaio 2025."}

data: {"type":"token","content":"\n\n**Raccomandazione**: Non utilizzare questo prodotto."}

data: {"type":"complete","sources":[],"cost":{"inputTokens":1842,"outputTokens":156,"tavilyCalls":0,"totalCostUsd":0.0012,"costWithMarginUsd":0.0014},"response":{"status":"COMPLETED","message":"Il prodotto **Prolectus 50 WG** (numero di registrazione 15549) è stato **revocato** il 16 gennaio 2025.\n\n**Raccomandazione**: Non utilizzare questo prodotto. Suggerisco di cercare alternative con lo stesso principio attivo (Fenpyrazamine).","sources":[]}}

```

---

### 2. Message (JSON) — Alternativa non-streaming

```
POST /agent-chat/message
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:** identico a `/stream`

#### curl — Message

```bash
curl -X POST 'http://localhost:8081/agent-chat/message' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOi...' \
  -d '{
    "threadId": "thread-002",
    "message": "Cos'\''è il rame in agricoltura?",
    "modelName": "gpt-4o-mini"
  }'
```

**Response JSON:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "Il rame è un elemento chimico utilizzato in agricoltura come fungicida e battericida. È impiegato per il controllo di diverse malattie delle piante, come la peronospora della vite e il cancro batterico delle drupacee. In Italia è regolamentato dai disciplinari di produzione integrata con un limite massimo di 4 kg di rame metallo per ettaro all'anno.",
    "sources": []
  }
}
```

---

### 3. Approve — Approvare un'azione distruttiva

Quando il tool `create_treatment_jobs` viene invocato, l'agente si ferma e chiede approvazione.

```
POST /agent-chat/approve
Content-Type: application/json
Authorization: Bearer <token>
```

#### curl — Approve

```bash
curl -X POST 'http://localhost:8081/agent-chat/approve' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOi...' \
  -d '{
    "threadId": "thread-002",
    "modelName": "gpt-4o-mini"
  }'
```

**Response JSON:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "Job creati con successo. Sono stati registrati 3 trattamenti per la produzione di Pere.",
    "sources": []
  }
}
```

---

### 4. Reject — Rifiutare un'azione

```
POST /agent-chat/reject
Content-Type: application/json
Authorization: Bearer <token>
```

#### curl — Reject

```bash
curl -X POST 'http://localhost:8081/agent-chat/reject' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOi...' \
  -d '{
    "threadId": "thread-002",
    "reason": "Preferisco modificare le dosi prima di creare i job.",
    "modelName": "gpt-4o-mini"
  }'
```

**Response JSON:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "Azione rifiutata. Posso aiutarti a modificare le dosi. Quali cambiamenti vuoi apportare?",
    "sources": []
  }
}
```

---

### 5. Get State — Stato conversazione

```
GET /agent-chat/state/:threadId?modelName=gpt-4o-mini
Authorization: Bearer <token>
```

#### curl — Get State

```bash
curl -X GET 'http://localhost:8081/agent-chat/state/thread-002?modelName=gpt-4o-mini' \
  -H 'Authorization: Bearer eyJhbGciOi...'
```

---

### 6. Chat History — Storico conversazioni

```bash
# Lista chat
curl -X GET 'http://localhost:8081/chats?category=DOSAGE_AGENT' \
  -H 'Authorization: Bearer eyJhbGciOi...'

# Dettaglio chat con messaggi
curl -X GET 'http://localhost:8081/chats/chat-id-123' \
  -H 'Authorization: Bearer eyJhbGciOi...'

# Elimina chat
curl -X DELETE 'http://localhost:8081/chats/chat-id-123' \
  -H 'Authorization: Bearer eyJhbGciOi...'
```

**Response lista chat:**

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

```tsx
function DosageAgentChat() {
  const {
    messages,
    isStreaming,
    pendingApproval,
    sendMessage,
    approve,
    reject,
    stop,
    newConversation,
  } = useAgentChat({
    baseUrl: 'http://localhost:8081',
    token: authToken,
    modelName: 'gpt-4o-mini',
    jobId: currentJobId, // opzionale
    workspaceId: currentWsId, // opzionale
  });

  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div>
      <button onClick={newConversation}>Nuova conversazione</button>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {/* Tool calls indicator */}
            {msg.toolCalls?.map((tc, i) => (
              <div key={i} className="tool-badge">
                🔧 {tc.name}
              </div>
            ))}

            {/* Message content (Markdown) */}
            <ReactMarkdown>{msg.content}</ReactMarkdown>

            {/* Streaming indicator */}
            {msg.status === 'streaming' && <span className="cursor">▌</span>}
          </div>
        ))}
      </div>

      {/* Approval dialog */}
      {pendingApproval && (
        <div className="approval-dialog">
          <p>
            L'agente vuole eseguire: <b>{pendingApproval.toolCall?.name}</b>
          </p>
          <pre>{JSON.stringify(pendingApproval.toolCall?.args, null, 2)}</pre>
          <button onClick={approve}>Approva</button>
          <button onClick={() => reject('Non voglio eseguire questa azione')}>Rifiuta</button>
        </div>
      )}

      {/* Input */}
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Chiedi all'agronomo AI..."
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={handleSend}>Invia</button>
        )}
      </div>
    </div>
  );
}
```

---

## Flusso completo: Esempio reale

### Scenario: Verifica conformità + Creazione job

```
Utente: "Pianifica i trattamenti per Captano su Melo (2 ha) e crea i job"

[1] → POST /agent-chat/stream
      {threadId: "t-001", message: "Pianifica i trattamenti per Captano..."}

[2] ← SSE: {type: "tool_call", toolCall: {name: "check_product_revoked", args: {productName: "Captano"}}}
[3] ← SSE: {type: "tool_call", toolCall: {name: "search_products", args: {products: [...], unitOfProduction: [...]}}}
[4] ← SSE: {type: "tool_call", toolCall: {name: "calculate_dosage", args: {strategy: "avg"}}}
[5] ← SSE: {type: "tool_call", toolCall: {name: "validate_compliance", args: {}}}
[6] ← SSE: {type: "token", content: "Ho verificato il Captano..."}
[7] ← SSE: {type: "token", content: " Dose conforme al disciplinare EMR..."}

    --- L'agente decide di creare i job ---

[8] ← SSE: {type: "requires_approval", toolCall: {name: "create_treatment_jobs", args: {persist: true}}}

    --- Frontend mostra dialog di approvazione ---

[9] → POST /agent-chat/approve {threadId: "t-001"}

[10] ← JSON: {status: "success", data: {status: "COMPLETED", message: "Creati 4 trattamenti..."}}
```

---

## Tool disponibili nell'agente

L'agente ha accesso a 19 tool. Il frontend non li chiama direttamente — l'LLM decide quali usare.
Utile mostrarli nella UI quando appaiono come `tool_call` events:

| Tool Name                          | Icona | Descrizione UI                          |
| ---------------------------------- | ----- | --------------------------------------- |
| `check_product_revoked`            | 🔍    | Verifica revoca prodotto                |
| `search_products`                  | 📦    | Ricerca prodotti per coltura            |
| `calculate_dosage`                 | 📊    | Calcolo dosi e date trattamento         |
| `validate_compliance`              | ✅    | Validazione disciplinare                |
| `validate_sa_group_limits`         | ⚠️    | Limiti gruppi sostanze attive           |
| `check_compatibility`              | 🧪    | Compatibilità principi attivi           |
| `calculate_stock_balance`          | 📋    | Bilancio scorte magazzino               |
| `optimize_dosage`                  | ⚙️    | Ottimizzazione dosi                     |
| `plan_treatment_strategy`          | 🎯    | Strategia trattamento                   |
| `expand_production_cycles`         | 🌱    | Espansione cicli produttivi             |
| `extract_buffer_zones`             | 🏞️    | Zone cuscinetto                         |
| `enrich_from_bdf`                  | 🏛️    | Arricchimento da Banca Dati Fitofarmaci |
| `create_treatment_jobs`            | 💾    | Creazione job (richiede approvazione)   |
| `search_disciplinari_database`     | 📖    | Ricerca disciplinari regionali          |
| `search_disciplinari_bdf_pdf`      | 📄    | Ricerca PDF disciplinari BDF            |
| `tavily_scientific_search`         | 🌐    | Ricerca scientifica web                 |
| `bdf_search_product_doses`         | 💊    | Dosi da BDF ufficiale                   |
| `bdf_search_products_by_adversity` | 🐛    | Prodotti per avversità                  |
| `search_rules`                     | 📜    | Regole aziendali                        |

---

## Note importanti

1. **threadId** — Deve essere lo stesso per tutta la conversazione. Generare con `uuid()` all'inizio e riusare per approve/reject.

2. **SSE parsing** — Le righe SSE hanno formato `data: {json}\n\n`. Splittare per `\n`, filtrare quelle che iniziano con `data: `.

3. **Approval gate** — Solo `create_treatment_jobs` richiede approvazione. Gli altri tool vengono eseguiti automaticamente.

4. **Errori** — Se arriva `{type: "error"}`, la conversazione è terminata. Mostrare messaggio e permettere retry.

5. **Costi** — L'evento `complete` include i costi in USD. Utile per mostrare al utente il consumo crediti.

6. **Chiusura stream** — Usare `AbortController` per interrompere lo stream lato client.
