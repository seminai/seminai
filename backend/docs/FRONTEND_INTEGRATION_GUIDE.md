# Guida Integrazione Frontend - Field Notes System

Documentazione completa per integrare il sistema Field Notes nel frontend, inclusa la chat AI con streaming live.

**Base URL (sviluppo locale):** `http://localhost:8081` — avvia il backend con `npm run dev` dalla cartella `seminai-be-v2`.

## 📚 Indice

1. [Login e autenticazione](#login-e-autenticazione)
2. [API CRUD Field Notes](#api-crud-field-notes)
3. [Gestione audio (trascrizione e allegati)](#gestione-audio-trascrizione-e-allegati)
4. [API Chat Agent con Streaming](#api-chat-agent-con-streaming)
5. [TypeScript Types](#typescript-types)
6. [Esempi di Integrazione](#esempi-di-integrazione)
7. [Gestione Errori](#gestione-errori)
8. [Best Practices](#best-practices)
9. [Storico chat Agente Dosage (React)](#storico-chat-agente-dosage-react)
10. [Workspace e selezione ambiente](#workspace-e-selezione-ambiente)
11. [Impostazioni Workspace (Settings)](#impostazioni-workspace-settings)

---

## Login e autenticazione

Le API Field Notes e Audio richiedono autenticazione. Il backend supporta **cookie httpOnly** (consigliato per web) e **Bearer token** (per client non-browser).

Base URL auth: `http://localhost:8081/auth`

### Login

**POST** `/auth/login`

Invia `credentials: 'include'` per ricevere e inviare automaticamente il cookie `auth_token` (impostato dal backend con `httpOnly`). Non salvare il token in `localStorage` o in cookie da JavaScript: vedi [FRONTEND_AUTH_MIGRATION.md](./FRONTEND_AUTH_MIGRATION.md) per dettagli sulla sicurezza.

```typescript
const response = await fetch('http://localhost:8081/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'your-password',
  }),
});

if (!response.ok) {
  const err = await response.json().catch(() => ({}));
  throw new Error(err.message ?? 'Login failed');
}

const body = await response.json();
// { token: string, user: { id, email, name, role, credits } }
const { token, user } = body;
// Per richieste da browser: non usare il token, usare sempre credentials: 'include'
// Per client non-browser (es. mobile): usa header Authorization: Bearer ${token}
```

### Utente corrente

**GET** `/auth/me`

Richiede autenticazione (cookie o `Authorization: Bearer <token>`).

```typescript
const response = await fetch('http://localhost:8081/auth/me', {
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${token}`, // opzionale se usi cookie
  },
});
const { user } = await response.json();
```

### Logout

**POST** `/auth/logout`

Invalida la sessione e rimuove il cookie `auth_token`.

```typescript
await fetch('http://localhost:8081/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
```

### Richieste autenticate successive

Per tutte le chiamate alle API (field-notes, audio-to-text, field-note-agent) usa sempre:

- **Browser (stesso dominio o CORS con credenziali):** `credentials: 'include'` e nessun header `Authorization` (il cookie viene inviato automaticamente).
- **Client non-browser o token esplicito:** `Authorization: Bearer <token>` (il token si ottiene dalla risposta di login).

---

## API CRUD Field Notes

Base URL: `http://localhost:8081/field-notes`

### 1. Creare una Field Note

**POST** `/field-notes`

```typescript
// Request
const response = await fetch('http://localhost:8081/field-notes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'OPERATION', // OPERATION | OBSERVATION | MEASUREMENT | HARVEST | MAINTENANCE | OTHER
    rawContent: 'ho dato 10 kg di rame nel campo vite',
    latitude: 45.438,     // Opzionale
    longitude: 10.992,    // Opzionale
    altitude: 150,        // Opzionale (metri)
    gpsAccuracy: 5,       // Opzionale (metri)
    operationDate: '2024-01-15T10:30:00Z', // Opzionale, default: now
    metadata: {           // Opzionale
      source: 'mobile_app',
      device: 'iPhone 12'
    }
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "id": "fn-abc-123",
    "userId": "user-xyz",
    "category": "OPERATION",
    "status": "PENDING",
    "rawContent": "ho dato 10 kg di rame nel campo vite",
    "extractedData": null,
    "latitude": 45.438,
    "longitude": 10.992,
    "altitude": 150,
    "gpsAccuracy": 5,
    "operationDate": "2024-01-15T10:30:00.000Z",
    "fieldId": null,
    "productionUnitId": null,
    "productId": null,
    "jobId": null,
    "metadata": { "source": "mobile_app" },
    "aiConfidenceScore": null,
    "notes": null,
    "attachments": [],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Ottenere Lista Field Notes

**GET** `/field-notes`

Query Parameters (tutti opzionali):

- `category`: OPERATION | OBSERVATION | MEASUREMENT | HARVEST | MAINTENANCE | OTHER
- `status`: PENDING | PROCESSING | PROCESSED | FAILED | MANUALLY_REVIEWED
- `fieldId`: UUID del campo
- `productionUnitId`: UUID dell'unità produttiva
- `productId`: UUID del prodotto
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date
- `hasLocation`: boolean (true = solo note con GPS)

```typescript
// Esempio: Tutte le operazioni processate con GPS
const response = await fetch(
  'http://localhost:8081/field-notes?' + new URLSearchParams({
    category: 'OPERATION',
    status: 'PROCESSED',
    hasLocation: 'true'
  }),
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// Response 200
{
  "status": "success",
  "data": [
    {
      "id": "fn-abc-123",
      "category": "OPERATION",
      "status": "PROCESSED",
      "rawContent": "ho dato 10 kg di rame nel campo vite",
      "fieldName": "Campo Vite Nord",
      "productName": "Rame Bordolese",
      // ... altri campi
    },
    // ... altre note
  ]
}
```

### 3. Ottenere Singola Field Note

**GET** `/field-notes/:id`

Restituisce la field note dell’utente autenticato. La risposta è sotto `data.fieldNote`.

**Dati restituiti (struttura completa):**

| Campo               | Tipo                      | Descrizione                                                                             |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `id`                | `string`                  | ID univoco della field note                                                             |
| `userId`            | `string`                  | ID utente proprietario                                                                  |
| `category`          | `string`                  | `OPERATION` \| `OBSERVATION` \| `MEASUREMENT` \| `HARVEST` \| `MAINTENANCE` \| `OTHER`  |
| `status`            | `string`                  | `PENDING` \| `PROCESSING` \| `PROCESSED` \| `FAILED` \| `MANUALLY_REVIEWED`             |
| `rawContent`        | `string`                  | Testo grezzo inserito dall’utente                                                       |
| `extractedData`     | `object \| null`          | Dati estratti dall’AI (prodotti, quantità, campo, osservazioni, ecc.); struttura libera |
| `latitude`          | `number \| null`          | Latitudine GPS (se presente)                                                            |
| `longitude`         | `number \| null`          | Longitudine GPS (se presente)                                                           |
| `altitude`          | `number \| null`          | Altitudine in metri (opzionale)                                                         |
| `gpsAccuracy`       | `number \| null`          | Precisione GPS in metri (opzionale)                                                     |
| `conformityNotes`   | `object \| array \| null` | Note di conformità (es. disciplinari)                                                   |
| `operationDate`     | `string`                  | Data/ora operazione (ISO 8601)                                                          |
| `fieldId`           | `string \| null`          | ID campo associato (se riconosciuto/assegnato)                                          |
| `productionUnitId`  | `string \| null`          | ID unità produttiva (se associata)                                                      |
| `productId`         | `string \| null`          | ID prodotto (es. fitosanitario) se riconosciuto                                         |
| `jobId`             | `string \| null`          | ID job di trattamento collegato (se presente)                                           |
| `metadata`          | `object \| null`          | Metadati liberi (es. `source`, `device`)                                                |
| `aiConfidenceScore` | `number \| null`          | Punteggio di confidenza AI (0–1) se processata                                          |
| `notes`             | `string \| null`          | Note testuali aggiuntive                                                                |
| `createdAt`         | `string`                  | Creazione (ISO 8601)                                                                    |
| `updatedAt`         | `string`                  | Ultimo aggiornamento (ISO 8601)                                                         |

**Nota:** l’endpoint **GET** `/field-notes/:id` restituisce solo i campi sopra (entità “piana”). Gli allegati e le relazioni (campo, unità produttiva, prodotto con nomi) sono disponibili nell’endpoint **GET** `/field-notes` (lista), dove ogni elemento può includere `fieldName`, `productName`, `productionUnitName` e gli `attachments` vanno gestiti tramite gli endpoint dedicati agli allegati se necessario.

```typescript
const response = await fetch(`http://localhost:8081/field-notes/${fieldNoteId}`, {
  credentials: 'include', // o Authorization: Bearer <token>
  headers: { Accept: 'application/json' },
});

const json = await response.json();
// json.status === 'success'
// json.data.fieldNote contiene tutti i campi elencati sopra

// Esempio data.fieldNote
{
  "id": "fn-abc-123",
  "userId": "user-xyz",
  "category": "OPERATION",
  "status": "PROCESSED",
  "rawContent": "ho dato 10 kg di rame nel campo vite",
  "extractedData": { "recognizedProducts": [...], ... },
  "latitude": 45.438,
  "longitude": 10.992,
  "altitude": 150,
  "gpsAccuracy": 5,
  "conformityNotes": null,
  "operationDate": "2024-01-15T10:30:00.000Z",
  "fieldId": "field-xyz",
  "productionUnitId": "pu-123",
  "productId": "prod-abc",
  "jobId": null,
  "metadata": null,
  "aiConfidenceScore": 0.95,
  "notes": null,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z"
}
```

### 4. Aggiornare Field Note

**PUT** `/field-notes/:id`

```typescript
const response = await fetch(`http://localhost:8081/field-notes/${fieldNoteId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'PROCESSED',
    fieldId: 'field-xyz',
    productId: 'prod-abc',
    notes: 'Confermato dal tecnico',
    extractedData: {
      recognizedProducts: [
        { name: 'Rame Bordolese', quantity: 10, unit: 'kg' }
      ]
    },
    aiConfidenceScore: 0.95
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "id": "fn-abc-123",
    // ... dati aggiornati
  }
}
```

### 5. Eliminare Field Note

**DELETE** `/field-notes/:id`

```typescript
const response = await fetch(`http://localhost:8081/field-notes/${fieldNoteId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response 200
{
  "status": "success",
  "message": "Field note deleted successfully"
}
```

### 6. Aggiungere Attachment

**POST** `/field-notes/attachments`

```typescript
// Upload diretto (consigliato)
const formData = new FormData();
formData.append('fieldNoteId', 'fn-abc-123');
formData.append('file', file);

const response = await fetch('http://localhost:8081/field-notes/attachments', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

// Oppure: Upload con URL già disponibile (alternativa)
// Prima: Upload file al tuo storage (S3, Cloud Storage, etc.)
const fileUrl = await uploadToStorage(file);

// Poi: Associa attachment alla field note
const response = await fetch('http://localhost:8081/field-notes/attachments', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fieldNoteId: 'fn-abc-123',
    fileUrl: fileUrl,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    thumbnailUrl: thumbnailUrl,  // Opzionale
    metadata: {                  // Opzionale
      width: 1920,
      height: 1080,
      gps: { lat: 45.438, lng: 10.992 }
    }
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "id": "att-1",
    "fieldNoteId": "fn-abc-123",
    "fileUrl": "https://storage.com/photo.jpg",
    // ... altri campi
  }
}
```

### 7. Ottenere Statistiche

**GET** `/field-notes/stats`

```typescript
const response = await fetch('http://localhost:8081/field-notes/stats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response 200
{
  "status": "success",
  "data": {
    "stats": {
      "totalNotes": 145,
      "byStatus": {
        "PENDING": 12,
        "PROCESSING": 3,
        "PROCESSED": 125,
        "FAILED": 2,
        "MANUALLY_REVIEWED": 3
      },
      "byCategory": {
        "OPERATION": 80,
        "OBSERVATION": 45,
        "MEASUREMENT": 15,
        "HARVEST": 3,
        "MAINTENANCE": 2,
        "OTHER": 0
      },
      "withLocation": 98,
      "withAttachments": 34,
      "averageConfidenceScore": 0.87
    }
  }
}
```

---

## Gestione audio (trascrizione e allegati)

Il backend espone due modalità per usare l’audio nel flusso Field Notes: **trascrizione audio → testo** (per creare o arricchire una field note) e **allegare un file audio** a una field note esistente.

### 1. Trascrivere audio in testo (Audio-to-Text)

**POST** `/audio-to-text/transcribe`

Endpoint per trascrivere un file audio in testo (OpenAI Whisper). Il testo ottenuto può essere usato come `rawContent` in **POST** `/field-notes` o inviato al Field Note Agent.

Base URL: `http://localhost:8081/audio-to-text`

- **Content-Type:** `multipart/form-data`
- **Campo file:** obbligatorio, file audio (formati supportati: mp3, mp4, mpeg, mpga, m4a, wav, webm)
- **Parametri opzionali (form):**
  - `prompt`: string — suggerimento per la trascrizione
  - `responseFormat`: `json` | `text` | `srt` | `verbose_json` | `vtt` — formato risposta (default `verbose_json`)
  - `postProcess`: `'true'` | `'false'` | `'1'` | `'0'` — abilita post-processing LLM per migliorare la qualità (consigliato per italiano)

```typescript
// 1. Trascrivi l'audio
const formData = new FormData();
formData.append('file', audioFile); // File object (es. da input type="file" o da MediaRecorder)
formData.append('postProcess', 'true');
formData.append('responseFormat', 'text');

const transcribeRes = await fetch('http://localhost:8081/audio-to-text/transcribe', {
  method: 'POST',
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${token}`, // oppure solo credentials: 'include' con cookie
  },
  body: formData,
});

if (!transcribeRes.ok) throw new Error('Transcription failed');
const { data } = await transcribeRes.json();
const transcribedText = typeof data.text === 'string' ? data.text : data.text?.text ?? '';

// 2. Crea una field note con il testo trascritto
const createRes = await fetch('http://localhost:8081/field-notes', {
  method: 'POST',
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    category: 'OBSERVATION',
    rawContent: transcribedText,
    metadata: { source: 'voice', language: data.language },
  }),
});
```

Risposta tipica **200** di `/audio-to-text/transcribe`:

```json
{
  "status": "success",
  "data": {
    "text": "Ho dato 10 kg di rame nel campo vite",
    "language": "it",
    "duration": 5.2,
    "segments": [
      { "start": 0, "end": 2.1, "text": "Ho dato 10 kg" },
      { "start": 2.1, "end": 5.2, "text": " di rame nel campo vite" }
    ]
  }
}
```

Se usi `responseFormat: 'verbose_json'` o `'json'`, la struttura può avere campi aggiuntivi; adatta l’estrazione di `data.text` in base al formato scelto.

### 2. Allegare un file audio a una Field Note

**POST** `/field-notes/attachments`

Lo stesso endpoint usato per immagini/PDF accetta anche file audio. Invia un `multipart/form-data` con campo `file` e `fieldNoteId` (vedi [Aggiungere Attachment](#6-aggiungere-attachment)).

Formati accettati: dipendono dalla configurazione Multer (nessun filtro MIME restrittivo nel backend); in pratica puoi inviare qualsiasi file. Per l’audio sono ad esempio supportati: mp3, m4a, wav, webm, ecc.

```typescript
const formData = new FormData();
formData.append('fieldNoteId', fieldNoteId);
formData.append('file', audioFile);

const response = await fetch('http://localhost:8081/field-notes/attachments', {
  method: 'POST',
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

// 201 - attachment creato
const { data } = await response.json();
// data: { id, fieldNoteId, fileUrl, fileName, fileType, fileSize, ... }
```

L’allegato audio viene salvato e associato alla field note; l’OCR/estrazione contesto (usata per immagini/PDF) non si applica agli audio. Per avere anche il testo dell’audio nella note, usa prima **POST** `/audio-to-text/transcribe` e poi crea o aggiorna la field note con quel testo in `rawContent`.

### Flusso consigliato: voce → Field Note

1. **Registra** l’audio (es. `MediaRecorder` in browser).
2. **Trascrivi:** **POST** `/audio-to-text/transcribe` con `postProcess: 'true'`.
3. **Crea field note:** **POST** `/field-notes` con `rawContent` = testo trascritto.
4. (Opzionale) **Allega** lo stesso file audio: **POST** `/field-notes/attachments` con `fieldNoteId` della note creata.

---

## API Chat Agent con Streaming

Base URL: `http://localhost:8081/field-note-agent`

### Come Funziona la Chat AI

```
┌──────────────────────────────────────────────────────────┐
│                    Chat Workflow                         │
└──────────────────────────────────────────────────────────┘

1. User invia messaggio      → POST /stream o /message
                              ↓
2. Agent analizza con AI      → classify_field_note_data
                              ↓
3. Agent chiede approvazione  → status: REQUIRES_APPROVAL
                              ↓
4. User approva              → POST /approve
                              ↓
5. Agent cerca entità        → find_user_fields, find_user_products
                              ↓
6. Agent presenta risultati   → "Ho trovato: Campo X, Prodotto Y"
                              ↓
7. User conferma salvataggio → "sì, salva"
                              ↓
8. Agent salva nel DB        → save_field_note
                              ↓
9. ✅ Field note salvata     → status: COMPLETED
```

### 1. Chat con Streaming (Consigliato)

**POST** `/field-note-agent/stream`

Streaming SSE (Server-Sent Events) per vedere il "pensiero" live dell'AI.

```typescript
// React/Vue/Vanilla JS
const threadId = `thread-${Date.now()}-${Math.random()}`;

const eventSource = new EventSource(
  'http://localhost:8081/field-note-agent/stream?' +
    new URLSearchParams({
      threadId: threadId,
      message: 'ho dato 10 kg di rame nel campo vite',
    }),
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
);

// Gestisci eventi streaming
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'token':
      // Token singolo del pensiero AI
      console.log('Token:', data.content);
      // Mostra in UI: appendThinkingText(data.content)
      break;

    case 'tool_call':
      // Agent sta per usare un tool
      console.log('Tool chiamato:', data.toolCall.name, data.toolCall.args);
      // UI: showToolCallIndicator(data.toolCall.name)
      break;

    case 'requires_approval':
      // Agent richiede approvazione umana
      console.log('Richiesta approvazione:', data.toolCall);
      // UI: showApprovalDialog(data.toolCall)
      eventSource.close();
      break;

    case 'complete':
      // Conversazione completata
      console.log('Completato:', data.response);
      // UI: showCompletionMessage(data.response)
      eventSource.close();
      break;

    case 'error':
      // Errore durante esecuzione
      console.error('Errore:', data.error);
      // UI: showError(data.error)
      eventSource.close();
      break;
  }
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
};
```

**⚠️ Nota su EventSource e Headers:**
EventSource standard non supporta custom headers. Per l'autenticazione, usa una di queste soluzioni:

**Soluzione 1: Token in URL (solo per development/test)**

```typescript
const url = `http://localhost:8081/field-note-agent/stream?token=${token}&threadId=${threadId}&message=${encodeURIComponent(message)}`;
const eventSource = new EventSource(url);
```

**Soluzione 2: fetch-event-source (Consigliato)**

```bash
npm install @microsoft/fetch-event-source
```

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source';

await fetchEventSource('http://localhost:8081/field-note-agent/stream', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    threadId: threadId,
    message: 'ho dato 10 kg di rame nel campo vite',
  }),
  onmessage(event) {
    const data = JSON.parse(event.data);
    // Gestisci come sopra
  },
  onerror(err) {
    console.error('SSE Error:', err);
  },
});
```

### 2. Chat Senza Streaming

**POST** `/field-note-agent/message`

Per app che non supportano SSE o per testing.

```typescript
const response = await fetch('http://localhost:8081/field-note-agent/message', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    threadId: threadId,
    message: 'ho dato 10 kg di rame nel campo vite',
    modelName: 'gpt-4o',      // Opzionale: gpt-4o | gpt-4o-mini | gpt-4-turbo
    temperature: 0.1          // Opzionale: 0-2, default 0.1
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "status": "REQUIRES_APPROVAL",  // COMPLETED | REQUIRES_APPROVAL | ERROR
    "message": "Ho analizzato la tua nota e ho classificato come OPERAZIONE...",
    "pendingToolCalls": [
      {
        "name": "classify_field_note_data",
        "args": {
          "rawContent": "ho dato 10 kg di rame nel campo vite"
        },
        "id": "call-abc-123"
      }
    ]
  }
}
```

### 3. Approvare Azione

**POST** `/field-note-agent/approve`

```typescript
const response = await fetch('http://localhost:8081/field-note-agent/approve', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    threadId: threadId
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "status": "COMPLETED", // o REQUIRES_APPROVAL se ci sono altri step
    "message": "Ho trovato il campo 'Campo Vite Nord' e il prodotto 'Rame Bordolese'..."
  }
}
```

### 4. Rifiutare e Correggere

**POST** `/field-note-agent/reject`

```typescript
const response = await fetch('http://localhost:8081/field-note-agent/reject', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    threadId: threadId,
    feedback: 'No, il campo era vigneto sud, non campo vite'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "status": "REQUIRES_APPROVAL",
    "message": "Ho capito, riclassifico con il campo 'vigneto sud'..."
  }
}
```

### 5. Ottenere Stato Conversazione

**GET** `/field-note-agent/state/:threadId`

```typescript
const response = await fetch(
  `http://localhost:8081/field-note-agent/state/${threadId}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// Response 200
{
  "status": "success",
  "data": {
    "messages": [
      { "role": "human", "content": "ho dato 10 kg di rame..." },
      { "role": "ai", "content": "Ho analizzato..." },
      // ... altri messaggi
    ],
    "pendingFieldNote": {
      "category": "OPERATION",
      "rawContent": "ho dato 10 kg di rame nel campo vite",
      "extractedData": { ... }
    }
  }
}
```

---

## TypeScript Types

```typescript
// Enums
export enum FieldNoteCategory {
  OPERATION = 'OPERATION',
  OBSERVATION = 'OBSERVATION',
  MEASUREMENT = 'MEASUREMENT',
  HARVEST = 'HARVEST',
  MAINTENANCE = 'MAINTENANCE',
  OTHER = 'OTHER',
}

export enum FieldNoteStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  MANUALLY_REVIEWED = 'MANUALLY_REVIEWED',
}

export enum AgentResponseStatus {
  COMPLETED = 'COMPLETED',
  REQUIRES_APPROVAL = 'REQUIRES_APPROVAL',
  ERROR = 'ERROR',
}

// Field Note Types
export interface FieldNote {
  id: string;
  userId: string;
  category: FieldNoteCategory;
  status: FieldNoteStatus;
  rawContent: string;
  extractedData: ExtractedData | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  gpsAccuracy: number | null;
  operationDate: string; // ISO 8601
  fieldId: string | null;
  fieldName?: string | null;
  productionUnitId: string | null;
  productionUnitName?: string | null;
  productId: string | null;
  productName?: string | null;
  jobId: string | null;
  metadata: Record<string, any> | null;
  aiConfidenceScore: number | null;
  notes: string | null;
  attachments: FieldNoteAttachment[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ExtractedData {
  recognizedProducts?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    productId?: string;
  }>;
  recognizedFields?: Array<{
    name: string;
    fieldId?: string;
  }>;
  operation?: string;
  observations?: string[];
  measurements?: Array<{
    type: string;
    value: number;
    unit: string;
  }>;
}

export interface FieldNoteAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  aiAnalysis: Record<string, any> | null;
  createdAt: string;
}

// Agent Types
export interface AgentStreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'complete' | 'requires_approval' | 'error';
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    id?: string;
  };
  error?: string;
  response?: AgentResponse;
}

export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    id: string;
  }>;
  error?: string;
  pendingFieldNote?: {
    category: FieldNoteCategory;
    rawContent: string;
    extractedData: ExtractedData;
  };
}

// Request Types
export interface CreateFieldNoteRequest {
  category: FieldNoteCategory;
  rawContent: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsAccuracy?: number;
  operationDate?: string;
  metadata?: Record<string, any>;
}

export interface UpdateFieldNoteRequest {
  category?: FieldNoteCategory;
  rawContent?: string;
  status?: FieldNoteStatus;
  fieldId?: string | null;
  productionUnitId?: string | null;
  productId?: string | null;
  notes?: string;
  extractedData?: ExtractedData;
  aiConfidenceScore?: number;
}

export interface ChatMessageRequest {
  threadId: string;
  message: string;
  modelName?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';
  temperature?: number;
}
```

---

## Esempi di Integrazione

### React Example - Chat Component con Streaming

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

```typescript
<template>
  <div class="field-notes-list">
    <div class="filters">
      <select v-model="filters.category">
        <option value="">Tutte le categorie</option>
        <option value="OPERATION">Operazioni</option>
        <option value="OBSERVATION">Osservazioni</option>
        <option value="MEASUREMENT">Misurazioni</option>
      </select>

      <select v-model="filters.status">
        <option value="">Tutti gli stati</option>
        <option value="PENDING">In attesa</option>
        <option value="PROCESSED">Processate</option>
      </select>

      <button @click="loadFieldNotes">🔄 Aggiorna</button>
    </div>

    <div v-if="loading">Caricamento...</div>

    <div v-else class="notes-grid">
      <div
        v-for="note in fieldNotes"
        :key="note.id"
        class="note-card"
        @click="openNote(note.id)"
      >
        <div class="note-header">
          <span class="category-badge">{{ note.category }}</span>
          <span class="status-badge" :class="note.status">
            {{ note.status }}
          </span>
        </div>

        <div class="note-content">
          {{ note.rawContent }}
        </div>

        <div class="note-metadata">
          <span v-if="note.fieldName">📍 {{ note.fieldName }}</span>
          <span v-if="note.productName">🧪 {{ note.productName }}</span>
          <span>📅 {{ formatDate(note.operationDate) }}</span>
        </div>

        <div v-if="note.attachments.length > 0" class="attachments">
          📎 {{ note.attachments.length }} allegati
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import type { FieldNote, FieldNoteCategory, FieldNoteStatus } from './types';

const fieldNotes = ref<FieldNote[]>([]);
const loading = ref(false);
const filters = reactive({
  category: '' as FieldNoteCategory | '',
  status: '' as FieldNoteStatus | ''
});

const loadFieldNotes = async () => {
  loading.value = true;

  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.status) params.append('status', filters.status);

  try {
    const response = await fetch(
      `http://localhost:8081/field-notes?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );

    const result = await response.json();
    fieldNotes.value = result.data;
  } catch (error) {
    console.error('Error loading field notes:', error);
  } finally {
    loading.value = false;
  }
};

const openNote = (id: string) => {
  // Navigate to detail page
  window.location.href = `/field-notes/${id}`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('it-IT');
};

onMounted(() => {
  loadFieldNotes();
});
</script>
```

---

## Gestione Errori

### Codici di Errore

```typescript
interface ErrorResponse {
  status: 'error';
  message: string;
  code?: string;
}

// Codici comuni
const ERROR_CODES = {
  // 400
  MISSING_FIELDS: 'Campi obbligatori mancanti',
  INVALID_MESSAGE: 'Messaggio non valido',
  INVALID_THREAD_ID: 'ThreadId non valido',
  INVALID_FEEDBACK: 'Feedback non valido',

  // 401
  USER_NOT_AUTHENTICATED: 'Utente non autenticato',
  UNAUTHORIZED: 'Non autorizzato',

  // 403
  FORBIDDEN: 'Accesso negato',

  // 404
  NOT_FOUND: 'Risorsa non trovata',

  // 500
  AGENT_ERROR: "Errore interno dell'agent",
  INTERNAL_ERROR: 'Errore interno del server',
};
```

### Error Handler Universale

```typescript
async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      // Log to monitoring service
      console.error('API Error:', error.message);

      // Show user-friendly message
      if (error.message.includes('401')) {
        // Redirect to login
        window.location.href = '/login';
      } else {
        // Show toast notification
        alert(error.message);
      }
    }
    throw error;
  }
}

// Uso
try {
  const result = await apiRequest<{ status: string; data: FieldNote }>(
    'http://localhost:8081/field-notes/abc-123',
  );
  console.log(result.data);
} catch (error) {
  // Già gestito dall'handler
}
```

---

## Best Practices

### 1. Gestione ThreadId

```typescript
// ✅ CORRETTO: Crea nuovo thread per ogni conversazione
const createNewThread = () => `thread-${Date.now()}-${Math.random()}`;

// ✅ CORRETTO: Riutilizza thread per conversazioni continue
const getOrCreateThread = () => {
  let threadId = sessionStorage.getItem('current_thread_id');
  if (!threadId) {
    threadId = createNewThread();
    sessionStorage.setItem('current_thread_id', threadId);
  }
  return threadId;
};

// ❌ SBAGLIATO: Hardcode del threadId
const threadId = 'my-thread'; // NO!
```

### 2. Ottimizzazione Streaming

```typescript
// ✅ Debounce del rendering per performance
import { debounce } from 'lodash';

const updateThinking = debounce((content: string) => {
  setThinkingText(content);
}, 100); // Aggiorna max ogni 100ms

// Nell'evento 'token'
case 'token':
  thinkingBuffer += data.content;
  updateThinking(thinkingBuffer);
  break;
```

### 3. Caching e Offline

```typescript
// Service Worker per cache
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/field-notes')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return (
          response ||
          fetch(event.request).then((fetchResponse) => {
            return caches.open('field-notes-v1').then((cache) => {
              cache.put(event.request, fetchResponse.clone());
              return fetchResponse;
            });
          })
        );
      }),
    );
  }
});

// IndexedDB per note offline
import { openDB } from 'idb';

const dbPromise = openDB('field-notes-db', 1, {
  upgrade(db) {
    db.createObjectStore('pending-notes', { keyPath: 'id' });
  },
});

// Salva offline
async function savePendingNote(note: CreateFieldNoteRequest) {
  const db = await dbPromise;
  await db.add('pending-notes', {
    id: Date.now(),
    ...note,
    createdAt: new Date().toISOString(),
  });
}

// Sincronizza quando online
async function syncPendingNotes() {
  const db = await dbPromise;
  const pendingNotes = await db.getAll('pending-notes');

  for (const note of pendingNotes) {
    try {
      await createFieldNote(note);
      await db.delete('pending-notes', note.id);
    } catch (error) {
      console.error('Sync error:', error);
    }
  }
}
```

### 4. GPS Precision

```typescript
// Richiedi alta precisione per field notes
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

// Uso
const position = await getCurrentPosition();
const fieldNote = {
  category: 'OPERATION',
  rawContent: input,
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  altitude: position.coords.altitude || undefined,
  gpsAccuracy: position.coords.accuracy,
};
```

### 5. Upload Ottimizzato Attachments

```typescript
// Resize immagini prima dell'upload
async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9);
    };
    img.src = URL.createObjectURL(file);
  });
}

// Upload con progress
async function uploadAttachment(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  // 1. Resize
  const resized = await resizeImage(file, 1920);

  // 2. Upload al tuo storage
  const formData = new FormData();
  formData.append('file', resized, file.name);

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        resolve(result.url);
      } else {
        reject(new Error('Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));

    xhr.open('POST', 'http://localhost:8081/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.send(formData);
  });
}
```

---

## Storico chat Agente Dosage (React)

Il frontend React (`seminai-fe-v3`) espone la pagina **Agente Dosage** (`/dosage-agent-chat`) con uno **storico delle chat** e la possibilità di aprire il **dettaglio** di una conversazione passata.

### Come funziona lo storico

- **API lista chat:** **GET** `/chats?category=DOSAGE_AGENT`  
  Restituisce l’elenco delle chat dell’utente per l’agente dosage. Ogni elemento è un **riepilogo** (`ChatSummary`).

- **Hook:** `useChats("DOSAGE_AGENT")`  
  Usa TanStack Query con chiave `["chats", "DOSAGE_AGENT"]` e chiama `chatsApiService.getChats({ category: "DOSAGE_AGENT" })`.

- **Sidebar cronologia:** il componente `ChatHistorySidebar` mostra la lista; ogni voce è un `ChatHistoryItem` con:
  - anteprima dell’ultimo messaggio (`lastMessage.content` troncato),
  - data (`updatedAt` formattata),
  - stato attivo se `chat.threadId === activeThreadId`,
  - azione elimina (con `useDeleteChat` e conferma).

### Come si aprono i dettagli di una chat

1. **Click su una voce** della cronologia chiama `onSelectChat(chat)`.
2. Il gestore **carica il dettaglio** con **GET** `/chats/:chatId`:
   - `chatsApiService.getChatDetail(chat.id)` restituisce un `ChatDetail` (id, threadId, category, modelName, temperature, metadata, createdAt, updatedAt, **messages**).
3. Con il dettaglio ricevuto:
   - si aggiorna il **threadId** in stato e in URL: `setSearchParams({ threadId: detail.threadId })`;
   - si caricano i messaggi nella chat: `loadMessages(detail.messages)` (conversione da `ChatMessage[]` al formato interno dell’hook `useDosageAgentChat`);
   - su mobile si chiude la sidebar (`setSidebarOpen(false)`).

**Tipi (frontend):**

- `ChatSummary`: `id`, `threadId`, `category`, `modelName`, `createdAt`, `updatedAt`, `lastMessage: { content, role, createdAt } | null`.
- `ChatDetail`: come sopra più `temperature`, `metadata`, `messages: ChatMessage[]`.
- `ChatMessage`: `id`, `role`, `content`, `contentBlocks`, `status`, `error`, `metadata`, `createdAt`.

L’eliminazione di una chat usa **DELETE** `/chats/:chatId` tramite `useDeleteChat` e invalida la cache `["chats"]`.

---

## Workspace e selezione ambiente

L’applicazione supporta un **workspace** (ambiente) selezionabile: l’utente può lavorare nell’**ambiente predefinito Seminai** oppure in un **workspace** (azienda/organizzazione) di cui è membro.

### Ruolo del workspace

- **Contesto:** molte API (es. agente dosage, job, field notes) usano il workspace selezionato per filtrare dati (aziende, unità produttive, prodotti) e per il multi-tenant.
- **Agente Dosage:** alla chat viene passato `workspaceId: currentWorkspace?.id` (da `useWorkspaceContext()`); se è `null` si usa l’ambiente predefinito.

### Dove si seleziona l’ambiente

- **WorkspaceSwitcher** (sidebar desktop e header mobile): dropdown che mostra:

  - **Workspace in uso:** nome corrente (o “Seminai” se nessun workspace) e sottotitolo “Ambiente predefinito” quando è Seminai.
  - **Impostazioni:** link a `/workspace/settings` se c’è un workspace selezionato.
  - **I tuoi workspace:** lista di tutti i workspace disponibili + voce “Seminai” (ambiente predefinito). Click su una voce:
    - **Seminai** → `exitWorkspace()` (torna all’ambiente predefinito);
    - **Workspace** → `selectWorkspace(ws.id)`.
  - **Crea Workspace** → navigazione a `/new-workspace`.

- **WorkspaceContext** (`useWorkspaceContext()`):
  - `currentWorkspace`: workspace attuale o `null` (Seminai).
  - `workspaces`: lista workspace dell’utente (da **GET** `/workspaces` o equivalente).
  - `selectWorkspace(workspaceId)`: imposta il workspace e persiste in `localStorage` (chiave scoped per utente).
  - `exitWorkspace()`: deseleziona il workspace (ritorno a Seminai).

### Persistenza e tema

- L’ID del workspace selezionato è salvato in **localStorage** (chiave tipo `seminai_current_workspace_id`, con scope per userId) e ripristinato al caricamento.
- Il tema (colori primari/secondari/accent del workspace) viene applicato al documento tramite variabili CSS; quando si cambia workspace, il tema si aggiorna di conseguenza.

Per integrare una nuova funzionalità “aware” del workspace, usare `useWorkspaceContext()` e, dove richiesto dall’API, inviare `workspaceId: currentWorkspace?.id` (o `null` per Seminai).

---

## Impostazioni Workspace (Settings)

La pagina **Impostazioni Workspace** consente di gestire nome, aspetto, membri, regole e (per i proprietari) l’eliminazione del workspace. È accessibile solo quando è selezionato un workspace (non in “Seminai” predefinito).

### Accesso e routing

- **URL:** `/workspace/settings` (tab “Generale”) oppure `/workspace/settings/:section` per una sezione specifica.
- **Parametro:** `section` può essere `general` (default), `appearance`, `members`, `rules`, `danger`.
- Se non c’è un workspace selezionato (`currentWorkspace === null`), la pagina mostra un messaggio e un pulsante per tornare alla dashboard; le impostazioni non sono disponibili per l’ambiente predefinito Seminai.

### Tab e navigazione

| Tab             | Value URL           | Contenuto                                                 |
| --------------- | ------------------- | --------------------------------------------------------- |
| Generale        | `general` o assente | Nome, slug, descrizione, logo                             |
| Aspetto         | `appearance`        | Colori (primario, secondario, accent)                     |
| Membri          | `members`           | Lista membri, inviti, ruoli, invita/rimuovi               |
| Regole          | `rules`             | Lista regole, filtri, crea/modifica/elimina, assegnazioni |
| Zona Pericolosa | `danger`            | Elimina workspace                                         |

Il cambio tab aggiorna l’URL: `general` → `/workspace/settings`, le altre → `/workspace/settings/<section>`.

### 1. Generale

- **Campi:** Nome workspace, Slug (identificatore per URL), Descrizione.
- **Logo:** upload immagine (PNG/JPG/GIF/WebP, max 5MB); anteprima e rimozione. Il backend può estrarre colori dal logo (opzionale).
- **API:**
  - **PUT** `/workspaces/:workspaceId` — body: `{ name?, slug?, description?, logoUrl? }` (per rimuovere logo si invia `logoUrl: null` o `""`).
  - **Upload logo:** di solito un endpoint dedicato tipo **POST** `/workspaces/:workspaceId/logo` con `multipart/form-data`; il frontend usa `useUploadWorkspaceLogo()` dopo aver salvato i dati generali.
- **Hook:** `useUpdateWorkspace`, `useUploadWorkspaceLogo`; dati letti da `useWorkspaceContext().currentWorkspace`.

### 2. Aspetto

- **Colori:** primario, secondario, accent. Preset (es. Verde, Blu, Viola, Rosa, Arancione, Teal) oppure colori personalizzati (picker + hex).
- **Anteprima:** i colori vengono applicati in tempo reale alle variabili CSS del tema (es. `--workspace-primary`, `--palette-*`).
- **API:** **PUT** `/workspaces/:workspaceId` con body `{ primaryColor, secondaryColor, accentColor }`.
- **Hook:** `useUpdateWorkspace`; i valori correnti sono in `currentWorkspace.primaryColor`, `secondaryColor`, `accentColor`.

### 3. Membri

- **Lista:** membri attivi (con user name/email) e inviti in sospeso; per ogni membro viene mostrato il ruolo (Proprietario, Admin, Membro, Visualizzatore).
- **Ruoli:** `OWNER` (un solo proprietario, non modificabile), `ADMIN`, `MEMBER`, `VIEWER`. Solo chi ha permessi (es. OWNER/ADMIN) può cambiare ruoli, invitare o rimuovere.
- **Invita:** form email + ruolo → invio invito; l’invitato riceve un link (es. `/workspace/accept-invitation`) per accettare.
- **Azioni:** cambia ruolo (dropdown/menu), rimuovi membro, annulla invito.
- **API (tipiche):**
  - **GET** `/workspaces/:workspaceId/members` — restituisce `{ members, invitations }`.
  - **POST** `/workspaces/:workspaceId/invitations` — body `{ email, role }`.
  - **PATCH** `/workspaces/:workspaceId/members/:memberId` — body `{ role }`.
  - **DELETE** `/workspaces/:workspaceId/members/:memberId` — rimuovi membro.
  - **DELETE** `/workspaces/:workspaceId/invitations/:invitationId` — annulla invito.
- **Hook:** `useWorkspaceMembers(workspaceId)`, `useInviteMember`, `useUpdateMember`, `useRemoveMember`, `useCancelInvitation`.

### 4. Regole

- **Lista:** regole del workspace con nome, categoria, stato, regione; filtri per categoria (Disciplinare, Standard, Buona Pratica, Metodologia, Personalizzata), stato (Bozza, Attiva, Archiviata, Deprecata) e ricerca testuale.
- **Limite:** il workspace ha un `maxRules`; non si possono creare più regole del consentito.
- **Azioni:** Crea Regola → `/new-rule`; Modifica → `/workspace/settings/rules/:ruleId`; Elimina (con conferma); Assegna/rimuovi regola ad aziende (drawer con lista aziende).
- **API (tipiche):**
  - **GET** `/workspaces/:workspaceId/rules` — lista regole (con eventuali filtri).
  - **POST** `/rules` — crea (body con nome, categoria, descrizione, ecc.).
  - **GET** `/rules/:ruleId`, **PUT** `/rules/:ruleId`, **DELETE** `/rules/:ruleId`.
  - Assegnazione aziende: **POST** e **DELETE** su endpoint tipo `/rules/:ruleId/companies` o equivalente.
- **Hook:** `useWorkspaceRules(workspaceId)`, `useRule(ruleId)`, `useDeleteRule`, `useAssignRuleToCompany`, `useRemoveRuleFromCompany`.

### 5. Zona Pericolosa

- **Elimina workspace:** pulsante che apre un dialog; per confermare bisogna digitare il **nome esatto** del workspace. Solo allora viene chiamata **DELETE** `/workspaces/:workspaceId`.
- **Dopo l’eliminazione:** il frontend chiama `exitWorkspace()`, mostra un toast e reindirizza alla dashboard (es. `/dashboard`).
- **Hook:** `useDeleteWorkspace`, `useWorkspaceContext().exitWorkspace`.

### Riepilogo API workspace (riferimento)

- **GET** `/workspaces` — lista workspace dell’utente.
- **GET** `/workspaces/:id` — dettaglio workspace.
- **POST** `/workspaces` — crea workspace.
- **PUT** `/workspaces/:id` — aggiorna (nome, slug, descrizione, logoUrl, colori).
- **DELETE** `/workspaces/:id` — elimina workspace.
- **POST** `/workspaces/:id/logo` — upload logo (multipart).
- Membri/inviti: GET members, POST invite, PATCH member, DELETE member, DELETE invitation.
- Regole: CRUD su `/rules` e assegnazioni alle aziende come da backend.

---

## 📚 Risorse Aggiuntive

- **Swagger UI**: `http://localhost:8081/api-docs`
- **Postman Collection**: [Download](link)
- **TypeScript SDK**: `npm install @yourcompany/seminai-sdk`
- **Support**: support@yourdomain.com

---

## 🔐 Sicurezza

1. **Sempre HTTPS** in produzione
2. **Token refresh** automatico prima della scadenza
3. **Rate limiting**: Max 60 req/min per utente
4. **Input sanitization**: Il backend già valida, ma fai anche lato frontend
5. **CORS**: Solo domini whitelisted

---

## 📊 Monitoraggio Performance

```typescript
// Track API performance
const trackApiCall = async (endpoint: string, fn: () => Promise<any>) => {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;

    // Send to analytics
    analytics.track('api_call', {
      endpoint,
      duration,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    analytics.track('api_call', {
      endpoint,
      duration,
      success: false,
      error: error.message,
    });

    throw error;
  }
};
```

---

**Ultimo aggiornamento**: 2024-01-15  
**Versione API**: v1.0  
**Mantainer**: dev@seminai.com
