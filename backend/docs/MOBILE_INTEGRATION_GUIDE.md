# Guida Integrazione Mobile - Seminai API

Documentazione completa per integrare le API Seminai in un'applicazione mobile (React Native, Flutter, Swift, Kotlin).

## Indice

1. [Setup e Configurazione](#1-setup-e-configurazione)
2. [Autenticazione e Registrazione](#2-autenticazione-e-registrazione)
3. [CRUD Field Notes](#3-crud-field-notes)
4. [Dosage Agent ReAct (Chat AI)](#4-dosage-agent-react-chat-ai)
5. [Settings Utente](#5-settings-utente)
6. [Gestione Errori](#6-gestione-errori)
7. [TypeScript Types di Riferimento](#7-typescript-types-di-riferimento)

---

## 1. Setup e Configurazione

### Base URL

```
Production: https://api.seminai.app
```

### Headers Comuni

```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

### Autenticazione

L'API utilizza **JWT (JSON Web Token)** con durata **24 ore**. Il token viene restituito al login/registrazione e va incluso in tutte le richieste autenticate nell'header `Authorization: Bearer <token>`.

### Rate Limiting

| Endpoint    | Limite       | Scope      |
| ----------- | ------------ | ---------- |
| Default     | 300 req/min  | Per IP     |
| Job polling | 1000 req/min | Per IP     |
| Start job   | 10 req/min   | Per utente |

Gli header di rate limit vengono restituiti in ogni risposta:

- `X-RateLimit-Limit` - Limite massimo
- `X-RateLimit-Remaining` - Richieste rimanenti
- `X-RateLimit-Reset` - Timestamp reset
- `Retry-After` - Secondi di attesa (solo su 429)

---

## 2. Autenticazione e Registrazione

### 2.1 Registrazione

**POST** `/auth/register`

```typescript
// Request
const response = await fetch(`${BASE_URL}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'utente@example.com',       // Obbligatorio
    password: 'password123',            // Obbligatorio, min 6 caratteri
    name: 'Mario',                      // Obbligatorio
    surname: 'Rossi',                   // Opzionale
    phoneNumber: '+393331234567',       // Opzionale
    fiscalCode: 'RSSMRA80A01H501Z',    // Opzionale
    address: 'Via Roma 1, Milano',      // Opzionale
    profilePictureUrl: 'https://...'    // Opzionale
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-utente",
      "email": "utente@example.com",
      "name": "Mario",
      "role": "BASIC",
      "credits": 10
    },
    "message": "User registered successfully"
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `MISSING_FIELDS` | Campi obbligatori mancanti |
| 409 | `USER_EXISTS` | Email gi&agrave; registrata |

> **Nota:** Dopo la registrazione viene inviata una email di verifica. L'utente deve confermare prima di poter usare alcune funzionalit&agrave;.

---

### 2.2 Login

**POST** `/auth/login`

```typescript
// Request
const response = await fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'utente@example.com',
    password: 'password123'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",  // JWT, durata 24h
    "user": {
      "id": "uuid-utente",
      "email": "utente@example.com",
      "name": "Mario",
      "role": "BASIC",
      "credits": 10
    }
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `MISSING_CREDENTIALS` | Email o password mancanti |
| 401 | `INVALID_CREDENTIALS` | Email non trovata o password errata |
| 401 | `GOOGLE_ONLY_ACCOUNT` | Account senza password, usare Google Login |

**Gestione Token nell'app mobile:**

```typescript
// Salvare il token in secure storage (es. react-native-keychain, flutter_secure_storage)
await SecureStorage.set('auth_token', data.token);
await SecureStorage.set('user', JSON.stringify(data.user));

// Creare un client HTTP con token automatico
const apiClient = {
  async request(url: string, options: RequestInit = {}) {
    const token = await SecureStorage.get('auth_token');
    return fetch(`${BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  },
};
```

---

### 2.3 Login con Google

**POST** `/auth/google/login`

Per il login Google, l'app mobile deve prima ottenere un `idToken` tramite Google Sign-In SDK (es. `@react-native-google-signin/google-signin`, `google_sign_in` per Flutter).

```typescript
// 1. Ottenere idToken dal Google SDK
const googleUser = await GoogleSignin.signIn();
const idToken = googleUser.idToken;

// 2. Inviare al backend
const response = await fetch(`${BASE_URL}/auth/google/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken })
});

// Response 200 - stessa struttura del login standard
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid-utente",
      "email": "utente@gmail.com",
      "name": "Mario Rossi",
      "role": "BASIC",
      "credits": 10
    }
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `MISSING_ID_TOKEN` | idToken non fornito |
| 401 | `INVALID_GOOGLE_TOKEN` | Token non valido |
| 401 | `GOOGLE_EMAIL_NOT_VERIFIED` | Email Google non verificata |

> **Nota:** Se l'utente non esiste, viene creato automaticamente con `password: null` (pu&ograve; accedere solo via Google). Se esiste gi&agrave; con email/password, l'account Google viene collegato.

---

### 2.4 Utente Corrente

**GET** `/auth/me`

```typescript
const response = await apiClient.request('/auth/me');

// Response 200
{
  "id": "uuid-utente",
  "email": "utente@example.com",
  "name": "Mario",
  "emailVerified": true,
  "profilePictureUrl": "https://...",
  "role": "BASIC",
  "credits": 10
}
```

Utile per verificare se il token salvato &egrave; ancora valido all'avvio dell'app.

---

### 2.5 Recupero Password

**POST** `/auth/forgot-password`

```typescript
await fetch(`${BASE_URL}/auth/forgot-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'utente@example.com' })
});

// Response 200 (sempre, anche se email non esiste - per sicurezza)
{
  "status": "success",
  "message": "If the email exists, a password reset link has been sent"
}
```

**POST** `/auth/reset-password`

```typescript
// L'utente arriva qui da un deep link nell'email
await fetch(`${BASE_URL}/auth/reset-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'token-dal-link-email',      // Dal deep link
    newPassword: 'nuovaPassword123',     // Min 6 caratteri
    confirmPassword: 'nuovaPassword123'
  })
});

// Response 200
{
  "status": "success",
  "message": "Password reset successfully"
}
```

**Errori reset:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `PASSWORD_MISMATCH` | Le password non coincidono |
| 400 | `PASSWORD_TOO_SHORT` | Password < 6 caratteri |
| 400 | `INVALID_TOKEN` | Token scaduto (1h) o non valido |

---

### 2.6 Cambio Password (Autenticato)

**PUT** `/auth/update-password`

```typescript
const response = await apiClient.request('/auth/update-password', {
  method: 'PUT',
  body: JSON.stringify({
    oldPassword: 'passwordVecchia',
    newPassword: 'passwordNuova123',     // Min 6 caratteri
    confirmPassword: 'passwordNuova123'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "user": { "id": "...", "email": "...", "name": "..." },
    "message": "Password updated successfully"
  }
}
```

---

### 2.7 Logout

**POST** `/auth/logout`

```typescript
await fetch(`${BASE_URL}/auth/logout`, { method: 'POST' });
// Lato mobile: eliminare token e dati utente dal secure storage
await SecureStorage.delete('auth_token');
await SecureStorage.delete('user');
```

---

### 2.8 Flusso Completo di Auth nell'App Mobile

```
App Start
  |
  ├─ Token salvato? ──YES──> GET /auth/me
  |                            ├─ 200 OK → Vai alla Home
  |                            └─ 401 → Token scaduto → Vai al Login
  |
  └─ NO ──> Mostra Login/Register
              |
              ├─ Register → POST /auth/register → Mostra "Verifica email"
              |
              ├─ Login email/pwd → POST /auth/login → Salva token → Home
              |
              ├─ Login Google → Google SDK → POST /auth/google/login → Salva token → Home
              |
              └─ Password dimenticata → POST /auth/forgot-password → Deep link email
                                          └─ POST /auth/reset-password → Vai al Login
```

---

## 3. CRUD Field Notes

Le field notes sono annotazioni in campo (trattamenti, osservazioni, misurazioni) che possono essere processate dall'AI.

### 3.1 Creare una Field Note

**POST** `/field-notes`

```typescript
const response = await apiClient.request('/field-notes', {
  method: 'POST',
  body: JSON.stringify({
    category: 'OPERATION',
    rawContent: 'Ho dato 10 kg di rame nel campo vite oggi pomeriggio',
    latitude: 45.438,          // Opzionale - GPS dal dispositivo
    longitude: 10.992,         // Opzionale
    altitude: 150,             // Opzionale (metri)
    gpsAccuracy: 5,            // Opzionale (metri)
    operationDate: '2024-06-15T14:30:00Z',  // Opzionale, default: now
    metadata: {                // Opzionale
      source: 'mobile_app',
      device: 'iPhone 15'
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
    "rawContent": "Ho dato 10 kg di rame nel campo vite oggi pomeriggio",
    "extractedData": null,
    "latitude": 45.438,
    "longitude": 10.992,
    "altitude": 150,
    "gpsAccuracy": 5,
    "operationDate": "2024-06-15T14:30:00.000Z",
    "fieldId": null,
    "productionUnitId": null,
    "productId": null,
    "jobId": null,
    "metadata": { "source": "mobile_app" },
    "aiConfidenceScore": null,
    "notes": null,
    "attachments": [],
    "createdAt": "2024-06-15T14:30:00.000Z",
    "updatedAt": "2024-06-15T14:30:00.000Z"
  }
}
```

**Categorie disponibili:**

| Categoria     | Descrizione                          |
| ------------- | ------------------------------------ |
| `OPERATION`   | Trattamenti, semine, potature        |
| `OBSERVATION` | Malattie, parassiti, stato coltura   |
| `MEASUREMENT` | Umidit&agrave;, temperatura, analisi |
| `HARVEST`     | Raccolta                             |
| `MAINTENANCE` | Manutenzione attrezzature            |
| `OTHER`       | Altro                                |

---

### 3.2 Lista Field Notes

**GET** `/field-notes`

```typescript
// Con filtri opzionali
const params = new URLSearchParams({
  category: 'OPERATION',                    // Opzionale
  status: 'PROCESSED',                      // Opzionale
  fieldId: 'field-uuid',                    // Opzionale
  productionUnitId: 'pu-uuid',             // Opzionale
  productId: 'product-uuid',               // Opzionale
  startDate: '2024-01-01T00:00:00Z',       // Opzionale
  endDate: '2024-12-31T23:59:59Z',         // Opzionale
  hasLocation: 'true'                       // Opzionale
});

const response = await apiClient.request(`/field-notes?${params}`);

// Response 200
{
  "status": "success",
  "data": [
    {
      "id": "fn-abc-123",
      "category": "OPERATION",
      "status": "PROCESSED",
      "rawContent": "Ho dato 10 kg di rame...",
      "extractedData": {
        "recognizedProducts": [
          { "name": "Rame", "quantity": 10, "unit": "kg", "confidence": 0.95 }
        ],
        "recognizedField": { "name": "Campo Vite", "confidence": 0.88 }
      },
      "operationDate": "2024-06-15T14:30:00.000Z",
      "field": {
        "id": "field-uuid",
        "name": "Campo Vite",
        "area": 2.5
      },
      "productionUnit": {
        "id": "pu-uuid",
        "name": "Vigneto Nord"
      },
      "company": {
        "id": "company-uuid",
        "name": "Azienda Agricola Rossi"
      },
      "attachments": [],
      "createdAt": "2024-06-15T14:30:00.000Z"
    }
    // ... altre note
  ]
}
```

**Stati di processamento:**

| Status              | Descrizione                  |
| ------------------- | ---------------------------- |
| `PENDING`           | In attesa di elaborazione AI |
| `PROCESSING`        | In corso di analisi          |
| `PROCESSED`         | Elaborata con successo       |
| `FAILED`            | Elaborazione fallita         |
| `MANUALLY_REVIEWED` | Rivista manualmente          |

---

### 3.3 Dettaglio Field Note

**GET** `/field-notes/:id`

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

```typescript
const formData = new FormData();
formData.append('threadId', threadId);
formData.append('message', 'Analizza questa foto del campo');
formData.append('file', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'campo.jpg',
});

const response = await fetch(`${BASE_URL}/field-note-agent/stream`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

#### Approvare/Rifiutare

```typescript
// Approvare un'azione pendente
await apiClient.request('/field-note-agent/approve', {
  method: 'POST',
  body: JSON.stringify({ threadId: 'uuid-conversazione' }),
});

// Rifiutare con feedback
await apiClient.request('/field-note-agent/reject', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
    feedback: 'Il campo non &egrave; quello, &egrave; il campo olivo',
  }),
});
```

#### Stato conversazione

**GET** `/field-note-agent/state/:threadId`

```typescript
const response = await apiClient.request(`/field-note-agent/state/${threadId}`);

// Response 200
{
  "status": "success",
  "data": {
    "messages": [ /* cronologia messaggi */ ],
    "pendingAction": null  // o { tool, args, description }
  }
}
```

---

## 4. Dosage Agent ReAct (Chat AI)

L'agente dosaggi &egrave; un assistente agronomico AI che aiuta a pianificare, validare ed eseguire trattamenti fitosanitari. Comunica in tempo reale via SSE.

### 4.1 Streaming Chat (Endpoint principale)

**POST** `/agent-chat/stream`

```typescript
const response = await fetch(`${BASE_URL}/agent-chat/stream`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    threadId: 'uuid-conversazione', // UUID unico per conversazione
    message: 'Pianifica un trattamento con poltiglia bordolese per la mia vite',
    modelName: 'gpt-4o', // Opzionale: gpt-4o | gpt-4o-mini | gpt-4-turbo
    temperature: 0, // Opzionale: 0-1
    jobId: 'job-uuid', // Opzionale: collega a un job esistente per contesto RAG
    workspaceId: 'ws-uuid', // Opzionale: scope per ricerca regole
  }),
});
```

### 4.2 Tipi di Evento SSE

```typescript
// 1. Token testuale - aggregare per costruire il messaggio
data: {"type":"token","content":"Analizzo"}
data: {"type":"token","content":" i prodotti"}

// 2. Chiamata a tool - mostrare indicatore "l'agente sta lavorando"
data: {"type":"tool_call","toolCall":{"name":"search_products","args":{...},"id":"call_123"}}

// 3. Risultato tool
data: {"type":"tool_result","content":"Trovati 3 prodotti compatibili..."}

// 4. Richiesta approvazione - mostrare dialog conferma
data: {"type":"requires_approval","toolCall":{"name":"create_treatment_jobs","args":{...}}}

// 5. Questionario - mostrare domande interattive
data: {"type":"questionnaire","questionnaire":{"id":"q1","questions":[...]}}

// 6. Piano di trattamento - mostrare piano strutturato
data: {"type":"plan","plan":{"id":"plan-1","steps":[...],"status":"draft"}}

// 7. Completamento turno
data: {"type":"complete","sources":[...],"cost":{"totalTokens":1500,"totalCost":0.05},"response":{...}}

// 8. Errore
data: {"type":"error","error":"Messaggio di errore"}
```

### 4.3 Parsing SSE in React Native

```typescript
async function streamChat(
  threadId: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
) {
  const token = await SecureStorage.get('auth_token');

  const response = await fetch(`${BASE_URL}/agent-chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ threadId, message }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Ultimo frammento incompleto

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // Ignorare linee malformate
        }
      }
    }
  }
}

// Uso
streamChat(threadId, 'Pianifica trattamento rame', (event) => {
  switch (event.type) {
    case 'token':
      setMessage((prev) => prev + event.content);
      break;
    case 'tool_call':
      setIsThinking(true);
      setCurrentTool(event.toolCall.name);
      break;
    case 'requires_approval':
      setIsThinking(false);
      setPendingApproval(event);
      break;
    case 'complete':
      setIsThinking(false);
      setSources(event.sources);
      setCost(event.cost);
      break;
    case 'error':
      setError(event.error);
      break;
  }
});
```

### 4.4 Messaggio Non-Streaming

**POST** `/agent-chat/message`

Alternativa sincrona allo streaming. Timeout: 180 secondi.

```typescript
const response = await apiClient.request('/agent-chat/message', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
    message: 'Quali prodotti ho disponibili per la vite?'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "status": "COMPLETED",           // COMPLETED | REQUIRES_APPROVAL | ERROR
    "message": "Ecco i prodotti disponibili per la vite: ...",
    "pendingToolCalls": null,         // Presente solo se REQUIRES_APPROVAL
    "sources": [
      { "title": "Etichetta Poltiglia", "url": "..." }
    ]
  }
}
```

### 4.5 Approvare / Rifiutare Azioni

Operazioni distruttive (creazione job, aziende, campi) richiedono approvazione esplicita.

**POST** `/agent-chat/approve`

```typescript
const response = await apiClient.request('/agent-chat/approve', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
  }),
});
// L'agente procede con l'azione e restituisce il risultato via streaming/JSON
```

**POST** `/agent-chat/reject`

```typescript
const response = await apiClient.request('/agent-chat/reject', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
    reason: 'Vorrei usare una dose minore',
  }),
});
// L'agente rivede l'azione in base al feedback
```

### 4.6 Stato Conversazione

**GET** `/agent-chat/state/:threadId`

```typescript
const response = await apiClient.request(`/agent-chat/state/${threadId}`);

// Response 200
{
  "status": "success",
  "data": {
    "messages": [
      { "role": "human", "content": "Pianifica trattamento..." },
      { "role": "ai", "content": "Analizzo i prodotti..." }
    ],
    "currentTask": "Calcolo dosaggi",
    "pendingAction": null,
    "sources": [...],
    "loopCounter": 3
  }
}
```

### 4.7 Job Asincrono (Dosaggio Batch)

Per elaborazioni pesanti (multi-azienda, molti prodotti), usare il sistema a coda.

**POST** `/dosage-agent/start-job`

```typescript
const response = await apiClient.request('/dosage-agent/start-job', {
  method: 'POST',
  body: JSON.stringify({
    products: [
      {
        productName: 'Poltiglia Bordolese',
        quantity: 50,
        quantityUnitOfMeasure: 'kg',
        strategy: 'avg'
      }
    ],
    unitOfProduction: [
      {
        id: 'pu-uuid',
        cropName: 'Vite',
        cropVariety: 'Merlot',
        disciplinari: ['Veneto DOP']
      }
    ],
    strategy: 'avg',
    startAt: '2024-03-01',
    endAt: '2024-10-31',
    outStockLimiter: true
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "jobId": "job-uuid-123"
  }
}
```

**GET** `/dosage-agent/job-status/:jobId` (Polling)

```typescript
const response = await apiClient.request(`/dosage-agent/job-status/${jobId}`);

// Response 200
{
  "status": "success",
  "data": {
    "id": "job-uuid-123",
    "state": "active",        // queued | active | completed | failed
    "progress": 65,           // 0-100
    "data": {
      "productsCount": 5,
      "unitsCount": 10,
      "unitsProcessed": 6
    },
    "result": null,            // Popolato solo quando state = completed
    "failedReason": null
  }
}
```

**GET** `/dosage-agent/jobs` (Lista job utente)

```typescript
const response = await apiClient.request('/dosage-agent/jobs');
```

**DELETE** `/dosage-agent/jobs/:jobId`

```typescript
await apiClient.request(`/dosage-agent/jobs/${jobId}`, { method: 'DELETE' });
```

### 4.8 Real-time via Socket.IO (Log Job)

Per ricevere log in tempo reale durante l'elaborazione di un job:

```typescript
import { io } from 'socket.io-client';

const socket = io(BASE_URL, {
  auth: { token: jwtToken },
  transports: ['websocket'],
});

socket.on('connect', () => {
  // Iscriversi ai log di un job specifico
  socket.emit('join-job', jobId);
});

socket.on('dosage:log', (event) => {
  // event.type: INFO | MATCH | WARNING | ERROR | PROGRESS | COMPLETED
  // event.message: descrizione testuale
  // event.metadata: dati aggiuntivi
  console.log(`[${event.type}] ${event.message}`);

  if (event.type === 'PROGRESS') {
    updateProgressBar(event.metadata.progress);
  }

  if (event.type === 'COMPLETED') {
    fetchJobResult(jobId);
  }
});

// Cleanup
socket.on('disconnect', () => {
  socket.emit('leave-job', jobId);
});
```

### 4.9 Tools Disponibili nell'Agente

L'agente ha accesso a 30+ strumenti. I pi&ugrave; rilevanti per l'UI:

| Tool                      | Descrizione                                 | Richiede Approvazione |
| ------------------------- | ------------------------------------------- | --------------------- |
| `search_products`         | Cerca prodotti compatibili con le colture   | No                    |
| `calculate_dosage`        | Calcola dosi e date trattamento             | No                    |
| `validate_compliance`     | Verifica conformit&agrave; disciplinari     | No                    |
| `check_compatibility`     | Controlla compatibilit&agrave; tra prodotti | No                    |
| `generate_plan`           | Genera piano trattamento strutturato        | No                    |
| `create_treatment_jobs`   | Crea job nel database                       | **S&igrave;**         |
| `create_company`          | Crea azienda                                | **S&igrave;**         |
| `create_fields`           | Crea campi                                  | **S&igrave;**         |
| `create_production_units` | Crea unit&agrave; produttive                | **S&igrave;**         |
| `ask_user_questions`      | Questionario interattivo                    | No                    |

---

## 5. Settings Utente

### 5.1 Profilo Utente

#### Leggere il profilo

**GET** `/users/me`

```typescript
const response = await apiClient.request('/users/me');

// Response 200
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-utente",
      "email": "utente@example.com",
      "name": "Mario",
      "surname": "Rossi",
      "fiscalCode": "RSSMRA80A01H501Z",
      "companyName": "Azienda Agricola Rossi",
      "vatNumber": "IT01234567890",
      "phoneNumber": "+393331234567",
      "address": "Via Roma 1, Milano",
      "profilePictureUrl": "https://storage.../photo.jpg",
      "role": "BASIC",
      "credits": 45.5,
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-06-15T10:00:00.000Z"
    },
    "qdcApiKey": "qdc-key-123",       // Dalla tabella Settings
    "ifarmingApiKey": null
  }
}
```

#### Aggiornare il profilo

**PATCH** `/users/me`

```typescript
const response = await apiClient.request('/users/me', {
  method: 'PATCH',
  body: JSON.stringify({
    name: 'Mario', // Opzionale
    surname: 'Rossi', // Opzionale
    fiscalCode: 'RSSMRA80A01H501Z', // Opzionale
    companyName: 'Azienda Rossi SRL', // Opzionale
    vatNumber: 'IT01234567890', // Opzionale
    phoneNumber: '+393331234567', // Opzionale
    address: 'Via Roma 1, Milano', // Opzionale
    qdcApiKey: 'new-qdc-key', // Opzionale, null per rimuovere
    ifarmingApiKey: 'new-ifarming-key', // Opzionale, null per rimuovere
  }),
});

// Response 200 - stessa struttura di GET /users/me
```

#### Upload foto profilo

**POST** `/users/me/profile-picture`

```typescript
const formData = new FormData();
formData.append('file', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'profile.jpg'
});

const token = await SecureStorage.get('auth_token');
const response = await fetch(`${BASE_URL}/users/me/profile-picture`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

// Response 200
{
  "status": "success",
  "data": {
    "user": { /* utente con profilePictureUrl aggiornato */ }
  }
}
```

---

### 5.2 Settings Applicazione

#### Creare le impostazioni

**POST** `/settings`

```typescript
const response = await apiClient.request('/settings', {
  method: 'POST',
  body: JSON.stringify({
    language: 'it',                    // Obbligatorio: 'it', 'en', 'fr', etc.
    qdcApiKey: 'your-qdc-key',        // Opzionale
    ifarmingApiKey: 'your-key'         // Opzionale
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "settings": {
      "id": "settings-uuid",
      "userId": "user-uuid",
      "language": "it",
      "qdcApiKey": "your-qdc-key",
      "ifarmingApiKey": null,
      "whatsappConnected": false,
      "whatsappAllowedNumbers": [],
      "createdAt": "2024-06-15T10:00:00.000Z",
      "updatedAt": "2024-06-15T10:00:00.000Z"
    }
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 409 | `SETTINGS_EXISTS` | Settings gi&agrave; create per l'utente |

#### Leggere le impostazioni

**GET** `/settings/me`

```typescript
const response = await apiClient.request('/settings/me');

// Response 200
{
  "status": "success",
  "data": {
    "settings": {
      "id": "settings-uuid",
      "userId": "user-uuid",
      "language": "it",
      "qdcApiKey": "your-qdc-key",
      "ifarmingApiKey": null,
      "whatsappInstanceName": null,
      "whatsappConnected": false,
      "whatsappPhoneNumber": null,
      "whatsappAllowedNumbers": [],
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

#### Aggiornare le impostazioni

**PUT** `/settings/:id`

```typescript
const response = await apiClient.request(`/settings/${settingsId}`, {
  method: 'PUT',
  body: JSON.stringify({
    language: 'en',                     // Opzionale
    qdcApiKey: 'new-key',              // Opzionale
    ifarmingApiKey: null                // null per rimuovere
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "settings": { /* settings aggiornate */ }
  }
}
```

#### Eliminare le impostazioni

**DELETE** `/settings/:id`

```typescript
await apiClient.request(`/settings/${settingsId}`, { method: 'DELETE' });
// Response 204 No Content
```

---

### 5.3 Svuotare Cache LLM

**DELETE** `/users/me/cache`

```typescript
const response = await apiClient.request('/users/me/cache', { method: 'DELETE' });

// Response 200
{
  "status": "success",
  "data": { "deletedCount": 15 }
}
```

---

## 6. Gestione Errori

### Formato Standard Errore

```typescript
// Tutti gli errori seguono questo formato
{
  "status": "error",
  "message": "Descrizione leggibile dell'errore",
  "code": "ERROR_CODE"    // Codice macchina per gestione frontend
}
```

### Codici Errore Comuni

| HTTP | Code                  | Descrizione                    | Azione Suggerita                 |
| ---- | --------------------- | ------------------------------ | -------------------------------- |
| 400  | `MISSING_FIELDS`      | Campi obbligatori mancanti     | Validare form prima dell'invio   |
| 400  | `PASSWORD_MISMATCH`   | Password non coincidono        | Mostrare errore inline           |
| 400  | `PASSWORD_TOO_SHORT`  | Password < 6 caratteri         | Mostrare errore inline           |
| 401  | `INVALID_CREDENTIALS` | Credenziali errate             | Mostrare errore nel form login   |
| 401  | `GOOGLE_ONLY_ACCOUNT` | Account Google-only            | Mostrare bottone Google Login    |
| 401  | (nessun code)         | Token scaduto/invalido         | Redirect a login, pulire storage |
| 403  | (forbidden)           | Non proprietario della risorsa | Mostrare "Accesso negato"        |
| 404  | (not found)           | Risorsa non trovata            | Mostrare "Non trovato"           |
| 409  | `USER_EXISTS`         | Email gi&agrave; registrata    | Suggerire login                  |
| 409  | `SETTINGS_EXISTS`     | Settings gi&agrave; create     | Usare PUT per aggiornare         |
| 429  | `RATE_LIMIT_EXCEEDED` | Troppe richieste               | Attendere `Retry-After` secondi  |
| 500  | (internal)            | Errore server                  | Mostrare errore generico, retry  |

### Gestione Centralizzata Errori

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function apiRequest(url: string, options: RequestInit = {}) {
  const token = await SecureStorage.get('auth_token');

  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    // Token scaduto -> redirect a login
    if (response.status === 401) {
      await SecureStorage.delete('auth_token');
      navigationRef.navigate('Login');
      throw new ApiError(401, 'UNAUTHORIZED', 'Sessione scaduta');
    }

    // Rate limit -> retry dopo attesa
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new ApiError(429, 'RATE_LIMIT', `Riprova tra ${retryAfter}s`);
    }

    throw new ApiError(
      response.status,
      error.code || 'UNKNOWN',
      error.message || 'Errore sconosciuto',
    );
  }

  if (response.status === 204) return null;
  return response.json();
}
```

---

## 7. TypeScript Types di Riferimento

```typescript
// ========== AUTH ==========

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string; // Min 6 caratteri
  name: string;
  surname?: string;
  phoneNumber?: string;
  fiscalCode?: string;
  address?: string;
  profilePictureUrl?: string;
}

interface GoogleLoginRequest {
  idToken: string;
}

interface AuthResponse {
  status: 'success';
  data: {
    token: string;
    user: UserBasic;
  };
}

interface UserBasic {
  id: string;
  email: string;
  name: string;
  role: 'BASIC' | 'ADMIN' | 'LABEL_MANAGER';
  credits: number;
}

interface UserFull extends UserBasic {
  surname: string | null;
  fiscalCode: string | null;
  companyName: string | null;
  vatNumber: string | null;
  phoneNumber: string | null;
  address: string | null;
  profilePictureUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== FIELD NOTES ==========

type FieldNoteCategory =
  | 'OPERATION'
  | 'OBSERVATION'
  | 'MEASUREMENT'
  | 'HARVEST'
  | 'MAINTENANCE'
  | 'OTHER';

type FieldNoteStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'MANUALLY_REVIEWED';

interface CreateFieldNoteRequest {
  category: FieldNoteCategory;
  rawContent: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsAccuracy?: number;
  operationDate?: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

interface UpdateFieldNoteRequest {
  category?: FieldNoteCategory;
  rawContent?: string;
  status?: FieldNoteStatus;
  fieldId?: string | null;
  productionUnitId?: string | null;
  productId?: string | null;
  notes?: string;
  extractedData?: Record<string, unknown>;
  aiConfidenceScore?: number;
}

interface FieldNote {
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
  operationDate: string;
  fieldId: string | null;
  field?: { id: string; name: string; area: number } | null;
  relatedFields?: Array<{ id: string; name: string }>;
  productionUnitId: string | null;
  productionUnit?: { id: string; name: string } | null;
  productId: string | null;
  product?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
  jobId: string | null;
  metadata: Record<string, unknown> | null;
  aiConfidenceScore: number | null;
  notes: string | null;
  conformityNotes: Record<string, unknown>[] | null;
  attachments: FieldNoteAttachment[];
  createdAt: string;
  updatedAt: string;
}

interface ExtractedData {
  recognizedProducts?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    confidence: number;
  }>;
  recognizedField?: {
    name: string;
    confidence: number;
  };
  recognizedProductionUnit?: {
    name: string;
    confidence: number;
  };
  recognizedOperation?: {
    type: string;
    description: string;
  };
}

interface FieldNoteAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  aiAnalysis: Record<string, unknown> | null;
  createdAt: string;
}

interface FieldNoteStats {
  totalNotes: number;
  byStatus: Record<FieldNoteStatus, number>;
}

// ========== DOSAGE AGENT ==========

interface StreamRequest {
  threadId: string;
  message: string;
  modelName?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';
  temperature?: number;
  jobId?: string;
  workspaceId?: string;
}

type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; content: string }
  | { type: 'requires_approval'; toolCall?: ToolCall }
  | { type: 'questionnaire'; questionnaire: Questionnaire }
  | { type: 'plan'; plan: TreatmentPlan }
  | { type: 'complete'; sources?: Source[]; cost?: CostMetrics; response?: AgentResponse }
  | { type: 'error'; error: string };

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

interface AgentResponse {
  status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';
  message?: string;
  pendingToolCalls?: ToolCall[];
  sources?: Source[];
  error?: string;
}

interface Source {
  title: string;
  url?: string;
}

interface CostMetrics {
  totalTokens: number;
  totalCost: number;
}

interface StartJobRequest {
  products: Array<{
    productName: string;
    quantity: number;
    quantityUnitOfMeasure: string;
    strategy?: 'min' | 'max' | 'avg' | 'current';
  }>;
  unitOfProduction: Array<{
    id: string;
    cropName: string;
    cropVariety?: string;
    disciplinari?: string[];
  }>;
  strategy?: 'min' | 'max' | 'avg' | 'current';
  startAt?: string;
  endAt?: string;
  outStockLimiter?: boolean;
}

interface JobStatus {
  id: string;
  state: 'queued' | 'waiting' | 'active' | 'completed' | 'failed' | 'stalled';
  progress: number;
  data?: {
    productsCount: number;
    unitsCount: number;
    unitsProcessed?: number;
  };
  result?: Record<string, unknown>;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}

// ========== SETTINGS ==========

interface CreateSettingsRequest {
  language: string; // Es: 'it', 'en', 'fr'
  qdcApiKey?: string;
  ifarmingApiKey?: string;
}

interface UpdateSettingsRequest {
  language?: string;
  qdcApiKey?: string | null; // null per rimuovere
  ifarmingApiKey?: string | null;
}

interface Settings {
  id: string;
  userId: string;
  language: string;
  qdcApiKey: string | null;
  ifarmingApiKey: string | null;
  whatsappInstanceName: string | null;
  whatsappConnected: boolean;
  whatsappPhoneNumber: string | null;
  whatsappAllowedNumbers: string[];
  createdAt: string;
  updatedAt: string;
}

interface UpdateUserProfileRequest {
  name?: string;
  surname?: string | null;
  fiscalCode?: string | null;
  companyName?: string | null;
  vatNumber?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  profilePictureUrl?: string | null;
  qdcApiKey?: string | null;
  ifarmingApiKey?: string | null;
}

interface UserProfileResponse {
  status: 'success';
  data: {
    user: UserFull;
    qdcApiKey: string | null;
    ifarmingApiKey: string | null;
  };
}

// ========== COMMON ==========

interface ApiSuccessResponse<T> {
  status: 'success';
  data: T;
}

interface ApiErrorResponse {
  status: 'error';
  message: string;
  code?: string;
}
```
