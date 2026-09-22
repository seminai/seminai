# Creazione Interventi Asincrona - Integrazione Frontend — Part 1

[Back to the guide index](../PRODUCT_JOB_CREATION_ASYNC_API.md)


## Panoramica

L'endpoint `POST /jobs/create-product-and-job` ora supporta due modalità:

- **Sincrona (201)**: quando tutti gli item hanno `productionUnitId`, la risposta arriva in 1-2 secondi come prima.
- **Asincrona (202)**: quando almeno un item NON ha `productionUnitId`, il backend restituisce immediatamente un `taskId` e processa in background (risoluzione PU tramite estrazione etichette + LLM matching).

## Flow Frontend

### 1. Invio della richiesta

```typescript
const response = await fetch('/jobs/create-product-and-job', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(items),
});
```

### 2. Gestione della risposta in base allo status code

```typescript
if (response.status === 201) {
  // PATH SINCRONO: risultato immediato (tutte le PU erano presenti)
  const { data } = await response.json();
  // data.jobs: Job[]
  // data.jobProductLinks: JobProductLink[]
  handleSyncResult(data);
} else if (response.status === 202) {
  // PATH ASINCRONO: il backend sta processando in background
  const { data } = await response.json();
  // data.taskId: string
  // data.message: string
  startPolling(data.taskId);
}
```

### 3. Polling dello stato (path asincrono)

```typescript
async function pollJobStatus(taskId: string): Promise<JobCreationResult> {
  const POLL_INTERVAL_MS = 2000; // 2 secondi

  while (true) {
    const response = await fetch(`/jobs/create-product-and-job/status/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await response.json();

    switch (data.state) {
      case 'completed':
        // data.result contiene il risultato finale
        return data.result;

      case 'failed':
        throw new Error(data.failedReason || 'Job creation failed');

      case 'not_found':
        throw new Error(data.message || 'Job not found');

      case 'queued':
      case 'waiting':
      case 'active':
      default:
        // Aggiorna la UI con il progresso
        updateProgress(data.progress); // 0-100
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        break;
    }
  }
}
```

### 4. Socket.IO per aggiornamenti live (opzionale, alternativa al polling)

```typescript
import { io } from 'socket.io-client';

const socket = io('https://api.example.com', {
  auth: { token },
  transports: ['websocket', 'polling'],
});

function watchJob(taskId: string) {
  socket.emit('join:job', taskId);

  socket.on('joined:job', ({ jobId, room }) => {
    console.log(`Joined room ${room} for job ${jobId}`);
  });

  // Aggiornamenti in tempo reale dal worker
  socket.on('dosage:log', (event) => {
    // event.message: string - messaggio di log
    // event.type: string - tipo di evento (INFO, PROGRESS, COMPLETION, ERROR)
    // event.metadata: object - dati aggiuntivi
    updateUI(event);
  });

  // Job completato
  socket.on('job:completed', ({ jobId }) => {
    // Fetch il risultato finale via polling endpoint
    fetchFinalResult(taskId);
    socket.emit('leave:job', taskId);
  });

  socket.on('error', ({ code, message }) => {
    if (code === 'JOB_COMPLETED') {
      // Job gia' completato, fetch risultato
      fetchFinalResult(taskId);
    }
  });
}
```

## Formato delle risposte

### POST /jobs/create-product-and-job

#### Risposta sincrona (201)

```json
{
  "status": "success",
  "data": {
    "jobs": [
      {
        "id": "uuid",
        "productionUnitId": "uuid",
        "dateOfOpeation": "2024-03-15T00:00:00.000Z",
        "category": "TREATMENT",
        "quantity": 10,
        "unitOfMeasureQuantity": "ha"
      }
    ],
    "jobProductLinks": [
      {
        "jobId": "uuid",
        "products": [
          {
            "id": "uuid",
            "name": "Prodotto XYZ",
            "registrationNumber": "12345"
          }
        ]
      }
    ]
  }
}
```

#### Risposta asincrona (202)

```json
{
  "status": "accepted",
  "data": {
    "taskId": "abc123",
    "message": "Creazione interventi avviata. Usa /jobs/create-product-and-job/status/:taskId per monitorare il progresso."
  }
}
```

### GET /jobs/create-product-and-job/status/:taskId

#### In corso

```json
{
  "status": "success",
  "data": {
    "id": "abc123",
    "state": "active",
    "progress": 45
  }
}
```

#### Completato

```json
{
  "status": "success",
  "data": {
    "id": "abc123",
    "state": "completed",
    "progress": 100,
    "result": {
      "jobs": [...],
      "jobProductLinks": [...],
      "warnings": [
        {
          "productName": "Prodotto non trovato",
          "registrationNumber": "99999",
          "reason": "No matching production unit found"
        }
      ]
    },
    "processedOn": "2024-03-15T10:00:00.000Z",
    "finishedOn": "2024-03-15T10:00:45.000Z"
  }
}
```

#### Fallito

```json
{
  "status": "success",
  "data": {
    "id": "abc123",
    "state": "failed",
    "progress": 30,
    "failedReason": "Error message describing what went wrong"
  }
}
```

#### Non trovato

```json
{
  "status": "success",
  "data": {
    "id": "abc123",
    "state": "not_found",
    "progress": 0,
    "stopPolling": true,
    "message": "Job not found or has been removed. Stop polling."
  }
}
```

## Stati del job

| Stato       | Significato                        | Progress  | Continuare polling? |
| ----------- | ---------------------------------- | --------- | ------------------- |
| `queued`    | In coda, in attesa di elaborazione | 0         | Si                  |
| `waiting`   | In attesa nella coda               | 0         | Si                  |
| `active`    | In elaborazione                    | 0-100     | Si                  |
| `completed` | Completato con successo            | 100       | No                  |
| `failed`    | Fallito con errore                 | Variabile | No                  |
| `stalled`   | Bloccato (timeout)                 | Variabile | Si                  |
| `not_found` | Non trovato o rimosso              | 0         | No                  |

## Fasi di progresso

Il campo `progress` avanza in base alla fase di elaborazione:

| Progress | Fase                                                                |
| -------- | ------------------------------------------------------------------- |
| 0-5%     | Inizializzazione                                                    |
| 5-60%    | Risoluzione unita' produttive (estrazione etichette + LLM matching) |
| 60-90%   | Creazione interventi nel database                                   |
| 90-100%  | Recupero link job-prodotti                                          |
