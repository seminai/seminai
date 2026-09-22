# Job Verification Agent API — Part 1

[Back to the guide index](../JOB_VERIFICATION_AGENT_API.md)


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
