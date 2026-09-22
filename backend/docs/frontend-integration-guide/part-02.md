# Guida Integrazione Frontend - Field Notes System — Part 2

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

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
