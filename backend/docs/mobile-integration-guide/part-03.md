# Guida Integrazione Mobile - Seminai API — Part 3

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)

```typescript
const response = await apiClient.request(`/field-notes/${fieldNoteId}`);

// Response 200 - stessa struttura della lista ma con relazioni complete
{
  "status": "success",
  "data": {
    "id": "fn-abc-123",
    "category": "OPERATION",
    "status": "PROCESSED",
    "rawContent": "...",
    "extractedData": { ... },
    "field": {
      "id": "field-uuid",
      "name": "Campo Vite",
      "area": 2.5
    },
    "relatedFields": [
      { "id": "field-2", "name": "Campo Olivo" }
    ],
    "productionUnit": { ... },
    "product": { ... },
    "company": { ... },
    "attachments": [
      {
        "id": "att-uuid",
        "fileUrl": "https://storage.../photo.jpg",
        "fileName": "photo.jpg",
        "fileType": "image/jpeg",
        "fileSize": 245000,
        "thumbnailUrl": null,
        "aiAnalysis": null,
        "createdAt": "2024-06-15T14:31:00.000Z"
      }
    ],
    "conformityNotes": [ ... ],
    "aiConfidenceScore": 0.92,
    "notes": "Nota manuale aggiuntiva",
    "createdAt": "2024-06-15T14:30:00.000Z",
    "updatedAt": "2024-06-15T15:00:00.000Z"
  }
}
```

---

### 3.4 Aggiornare una Field Note

**PUT** `/field-notes/:id`

```typescript
const response = await apiClient.request(`/field-notes/${fieldNoteId}`, {
  method: 'PUT',
  body: JSON.stringify({
    category: 'OBSERVATION',              // Opzionale
    rawContent: 'Testo aggiornato...',    // Opzionale
    status: 'MANUALLY_REVIEWED',          // Opzionale
    fieldId: 'field-uuid',                // Opzionale, null per rimuovere
    productionUnitId: 'pu-uuid',          // Opzionale
    productId: 'product-uuid',            // Opzionale
    notes: 'Nota aggiuntiva manuale'      // Opzionale
  })
});

// Response 200
{
  "status": "success",
  "data": { /* field note aggiornata con relazioni */ }
}
```

**Errori:**
| Codice | Descrizione |
|--------|-------------|
| 404 | Field note non trovata |
| 403 | Non sei il proprietario della nota |

---

### 3.5 Eliminare una Field Note

**DELETE** `/field-notes/:id`

```typescript
await apiClient.request(`/field-notes/${fieldNoteId}`, {
  method: 'DELETE',
});

// Response 204 No Content
```

---

### 3.6 Aggiungere Allegati

**POST** `/field-notes/attachments`

Supporta sia JSON (con URL pre-caricato) che `multipart/form-data` per upload diretto.

```typescript
// Opzione 1: Upload diretto con multipart/form-data
const formData = new FormData();
formData.append('fieldNoteId', fieldNoteId);
formData.append('file', {
  uri: 'file:///path/to/photo.jpg',  // URI locale del file
  type: 'image/jpeg',
  name: 'photo.jpg',
});

const token = await SecureStorage.get('auth_token');
const response = await fetch(`${BASE_URL}/field-notes/attachments`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    // NON impostare Content-Type per multipart
  },
  body: formData
});

// Opzione 2: JSON con URL gi&agrave; caricato
const response = await apiClient.request('/field-notes/attachments', {
  method: 'POST',
  body: JSON.stringify({
    fieldNoteId: 'fn-abc-123',
    fileUrl: 'https://storage.../photo.jpg',
    fileName: 'photo.jpg',
    fileType: 'image/jpeg',
    fileSize: 245000,
    thumbnailUrl: 'https://storage.../thumb.jpg',  // Opzionale
    metadata: { source: 'camera' }                  // Opzionale
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "id": "att-uuid",
    "fieldNoteId": "fn-abc-123",
    "fileUrl": "https://storage.../photo.jpg",
    "fileName": "photo.jpg",
    "fileType": "image/jpeg",
    "fileSize": 245000,
    "thumbnailUrl": null,
    "aiAnalysis": null,
    "metadata": { "ocr": { "provider": "mistral", "markdown": "..." } },
    "createdAt": "2024-06-15T14:31:00.000Z"
  }
}
```

> **Nota:** Per immagini e PDF, il backend esegue automaticamente OCR tramite Mistral e salva il risultato in `metadata.ocr`.

---

### 3.7 Statistiche Field Notes

**GET** `/field-notes/stats`

```typescript
const response = await apiClient.request('/field-notes/stats');

// Response 200
{
  "status": "success",
  "data": {
    "totalNotes": 42,
    "byStatus": {
      "PENDING": 5,
      "PROCESSING": 2,
      "PROCESSED": 30,
      "FAILED": 3,
      "MANUALLY_REVIEWED": 2
    }
  }
}
```

---

### 3.8 Field Note Agent (Chat AI)

L'agent AI pu&ograve; analizzare testo libero, classificare note, riconoscere prodotti/campi e salvare field notes strutturate. Usa il flusso approvazione: prima propone, l'utente conferma.

#### Streaming Chat

**POST** `/field-note-agent/stream`

```typescript
// Request - testo
const response = await fetch(`${BASE_URL}/field-note-agent/stream`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    threadId: 'uuid-conversazione', // Generare un UUID per ogni nuova conversazione
    message: 'Ho spruzzato 3 litri di poltiglia bordolese nel campo vite stamattina',
    modelName: 'gpt-4o', // Opzionale
  }),
});

// Response: Server-Sent Events stream
// Parsing SSE
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));

      switch (event.type) {
        case 'token':
          // Testo incrementale dell'agente
          appendToMessage(event.content);
          break;

        case 'tool_call':
          // L'agente sta usando uno strumento
          showToolIndicator(event.toolCall.name);
          break;

        case 'requires_approval':
          // L'agente vuole salvare: mostrare conferma
          showApprovalDialog(event);
          break;

        case 'complete':
          // Turno completato
          finalizeMessage(event.response);
          break;

        case 'error':
          showError(event.error);
          break;
      }
    }
  }
}
```

#### Con upload file (multipart)
