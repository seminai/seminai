# Guida Integrazione Frontend - Field Notes System — Part 3

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

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
