# Dosage ReAct Agent — Frontend Integration Guide — Part 1

[Back to the guide index](../dosage-react-agent-frontend-integration.md)


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
