# Dosage Agent Real-Time Log Streaming — Part 1

[Back to the guide index](../DOSAGE_AGENT_STREAMING.md)


Questo documento descrive come utilizzare Socket.IO per ricevere in tempo reale i log del dosage agent durante l'elaborazione dei job.

## Panoramica

Il sistema di streaming consente ai client autenticati di ricevere aggiornamenti in tempo reale sull'elaborazione dei job del dosage agent, inclusi:

- Match dei prodotti con le unità di produzione
- Fallback LLM per matching semantico
- Risultati del matching LLM con confidence e motivazioni
- Timing delle varie fasi di elaborazione
- Progress updates
- Warning ed errori

## Architettura

### Backend

Il backend utilizza:

- **Socket.IO** per la comunicazione bidirezionale
- **JWT Authentication** per autenticare le connessioni Socket.IO
- **Room-based messaging** per inviare log solo agli utenti interessati
- **DosageLoggerService** singleton per centralizzare l'emissione dei log

### Eventi Disponibili

Il client può ricevere i seguenti tipi di eventi:

#### `dosage:log`

Evento principale che contiene tutti i log. La struttura base è:

```typescript
interface DosageLogEvent {
  jobId: string; // ID del job
  userId: string; // ID dell'utente
  timestamp: Date; // Timestamp del log
  type: DosageLogEventType; // Tipo di evento
  message: string; // Messaggio leggibile
  metadata?: Record<string, unknown>; // Dati aggiuntivi
}
```

#### Tipi di eventi (`DosageLogEventType`):

- `info` - Informazioni generali
- `match` - Match di un prodotto con un'unità
- `match-fallback` - Attivazione del fallback LLM
- `llm-match` - Risultato del matching LLM
- `label-extraction` - Eventi durante l'estrazione delle etichette
- `flows` - Messaggi relativi ai flussi di elaborazione
- `flows-timing` - Informazioni sui tempi di esecuzione
- `warning` - Avvisi
- `error` - Errori
- `progress` - Aggiornamenti di progresso
- `completed` - Completamento del job

## Utilizzo dal Client

### 1. Installazione

```bash
npm install socket.io-client
```

### 2. Connessione con Autenticazione

```typescript
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:8081';
const JWT_TOKEN = 'your-jwt-token'; // Token ottenuto dal login

const socket: Socket = io(SERVER_URL, {
  auth: {
    token: JWT_TOKEN,
  },
  transports: ['websocket', 'polling'],
});

// Gestione connessione
socket.on('connect', () => {
  console.log('Connesso al server Socket.IO:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Errore di connessione:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnesso:', reason);
});
```

### 3. Join alla Room del Job

Dopo aver avviato un job, joinare la room per ricevere i suoi log:

```typescript
const jobId = 'your-job-id'; // ID ottenuto dalla risposta di start job

// Join alla room del job
socket.emit('join:job', jobId);

// Conferma di join
socket.on('joined:job', (data) => {
  console.log('Joined room:', data);
  // { jobId: 'xxx', room: 'job:xxx' }
});
```

### 4. Ricezione dei Log

```typescript
socket.on('dosage:log', (event) => {
  console.log(`[${event.type}] ${event.message}`);

  switch (event.type) {
    case 'match':
      // Match di un prodotto
      const { productName, productId, unitId, quantity } = event.metadata;
      console.log(`Prodotto ${productName} matched per unità ${unitId} - qty: ${quantity}`);
      break;

    case 'llm-match':
      // Risultato matching LLM
      const { cropName, compatible, confidence, reason } = event.metadata;
      console.log(`LLM Match: ${compatible ? '✓' : '✗'} Confidence: ${confidence}%`);
      console.log(`Motivo: ${reason}`);
      break;

    case 'match-fallback':
      // Fallback LLM attivato
      const { mechanicalMatches, unmatchedProducts } = event.metadata;
      console.log(
        `Fallback LLM: ${mechanicalMatches} match meccanici, ${unmatchedProducts} prodotti non matchati`,
      );
      break;

    case 'label-extraction':
      // Eventi durante l'estrazione delle etichette
      console.log(`Label Extraction: ${event.message}`);
      if (event.metadata) {
        console.log('Metadata:', event.metadata);
      }
      break;

    case 'flows-timing':
      // Timing di una fase
      const { phase, duration, memoryUsage } = event.metadata;
      console.log(`Fase ${phase} completata in ${duration}ms - ${memoryUsage}`);
      break;

    case 'progress':
      // Aggiornamento progresso
      const { progress, phase: currentPhase } = event.metadata;
      console.log(`Progresso ${currentPhase}: ${progress}%`);
      break;

    case 'completed':
      // Job completato
      console.log('Job completato!');
      break;

    case 'error':
      // Errore
      console.error('Errore:', event.message);
      break;
  }
});
```

### 5. Leave dalla Room

Quando non si è più interessati ai log di un job:

```typescript
socket.emit('leave:job', jobId);

socket.on('left:job', (data) => {
  console.log('Left room:', data);
});
```

### 6. Disconnessione

```typescript
socket.disconnect();
```

## Esempio Completo - React Hook
