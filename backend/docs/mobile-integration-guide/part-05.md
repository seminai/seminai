# Guida Integrazione Mobile - Seminai API — Part 5

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)

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
