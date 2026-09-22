# Dosage Agent Real-Time Log Streaming

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

const SERVER_URL = 'https://seminai-be-v2-661301438659.europe-west1.run.app';
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

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface DosageLogEvent {
  jobId: string;
  userId: string;
  timestamp: Date;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export function useDosageJobLogs(jobId: string | null, token: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [logs, setLogs] = useState<DosageLogEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:8081', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Socket.IO connected');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket.IO disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!socket || !jobId) return;

    // Join alla room del job
    socket.emit('join:job', jobId);

    // Listener per i log
    const handleLog = (event: DosageLogEvent) => {
      setLogs((prev) => [...prev, event]);
    };

    socket.on('dosage:log', handleLog);

    return () => {
      socket.emit('leave:job', jobId);
      socket.off('dosage:log', handleLog);
    };
  }, [socket, jobId]);

  return { logs, isConnected };
}

// Utilizzo nel componente
function DosageJobMonitor({ jobId, token }: { jobId: string; token: string }) {
  const { logs, isConnected } = useDosageJobLogs(jobId, token);

  return (
    <div>
      <h2>Job Monitoring</h2>
      <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      <div>
        {logs.map((log, idx) => (
          <div key={idx} className={`log-${log.type}`}>
            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
            <strong>[{log.type}]</strong>
            <span>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Esempio Completo - Vanilla JavaScript

```html
<!doctype html>
<html>
  <head>
    <title>Dosage Agent Monitor</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
  </head>
  <body>
    <h1>Dosage Agent Real-Time Monitor</h1>
    <div id="status">Disconnected</div>
    <div id="logs"></div>

    <script>
      const SERVER_URL = 'http://localhost:8081';
      const JWT_TOKEN = 'your-jwt-token';
      const JOB_ID = 'your-job-id';

      const socket = io(SERVER_URL, {
        auth: { token: JWT_TOKEN },
        transports: ['websocket', 'polling'],
      });

      const statusEl = document.getElementById('status');
      const logsEl = document.getElementById('logs');

      socket.on('connect', () => {
        statusEl.textContent = '🟢 Connected';
        socket.emit('join:job', JOB_ID);
      });

      socket.on('disconnect', () => {
        statusEl.textContent = '🔴 Disconnected';
      });

      socket.on('dosage:log', (event) => {
        const logDiv = document.createElement('div');
        logDiv.className = `log log-${event.type}`;

        const time = new Date(event.timestamp).toLocaleTimeString();
        logDiv.innerHTML = `
        <span class="time">${time}</span>
        <strong class="type">[${event.type}]</strong>
        <span class="message">${event.message}</span>
      `;

        logsEl.appendChild(logDiv);
        logsEl.scrollTop = logsEl.scrollHeight;
      });
    </script>

    <style>
      #logs {
        height: 500px;
        overflow-y: auto;
        border: 1px solid #ccc;
        padding: 10px;
        font-family: monospace;
      }
      .log {
        margin: 5px 0;
        padding: 5px;
      }
      .log-error {
        background-color: #ffebee;
      }
      .log-warning {
        background-color: #fff3e0;
      }
      .log-match {
        background-color: #e8f5e9;
      }
      .log-llm-match {
        background-color: #e3f2fd;
      }
      .time {
        color: #666;
        margin-right: 10px;
      }
      .type {
        margin-right: 10px;
      }
    </style>
  </body>
</html>
```

## Security

- **Autenticazione JWT obbligatoria**: Tutte le connessioni Socket.IO richiedono un token JWT valido
- **Room isolation**: Ogni job ha la propria room, gli utenti ricevono solo i log dei job a cui si sono uniti
- **User ID validation**: Il backend verifica che il token JWT contenga l'ID utente corretto

## Troubleshooting

### Errore "Authentication token required"

Assicurarsi di passare il token JWT nell'opzione `auth` durante la connessione.

### Nessun log ricevuto

Verificare di aver fatto join alla room del job con `socket.emit('join:job', jobId)`.

### Disconnessioni frequenti

Controllare la configurazione CORS e i firewall. Provare ad abilitare sia websocket che polling.

### Token scaduto

Implementare un meccanismo di refresh del token e riconnessione automatica.

## Best Practices

1. **Gestire la riconnessione**: Implementare logica di auto-reconnect in caso di disconnessione
2. **Limitare i log**: Considerare un buffer con limite massimo per evitare memory leak
3. **Cleanup**: Fare sempre leave dalla room quando il componente viene smontato
4. **Error handling**: Gestire sempre gli errori di connessione e autenticazione
5. **Performance**: Per molti log, considerare virtual scrolling o pagination

## API Reference

### Client Events (Emit)

| Evento      | Parametri       | Descrizione                |
| ----------- | --------------- | -------------------------- |
| `join:job`  | `jobId: string` | Join alla room di un job   |
| `leave:job` | `jobId: string` | Leave dalla room di un job |

### Server Events (Listen)

| Evento          | Payload           | Descrizione               |
| --------------- | ----------------- | ------------------------- |
| `connect`       | -                 | Connessione stabilita     |
| `disconnect`    | `reason: string`  | Connessione chiusa        |
| `connect_error` | `error: Error`    | Errore di connessione     |
| `joined:job`    | `{ jobId, room }` | Conferma join alla room   |
| `left:job`      | `{ jobId, room }` | Conferma leave dalla room |
| `dosage:log`    | `DosageLogEvent`  | Log del dosage agent      |

## Metadata per Tipo di Evento

### `match`

```typescript
{
  productName: string;
  productId: string;
  unitId: string;
  quantity: number;
}
```

### `llm-match`

```typescript
{
  productName: string;
  cropName: string;
  compatible: boolean;
  confidence: number;
  reason?: string;
}
```

### `match-fallback`

```typescript
{
  mechanicalMatches: number;
  unmatchedProducts: number;
  unitId: string;
}
```

### `flows-timing`

```typescript
{
  phase: string;
  duration: number;
  memoryUsage?: string;
}
```

### `progress`

```typescript
{
  progress: number;
  phase: string;
}
```

### `label-extraction`

Eventi durante l'estrazione delle etichette dai PDF:

```typescript
{
  message: string; // Messaggio descrittivo
  metadata?: {
    chars?: number; // Caratteri del testo
    estimatedTokens?: number; // Token stimati
    model?: string; // Modello LLM usato
    chunksCount?: number; // Numero di chunk
    chunkIndex?: number; // Indice del chunk corrente
    totalChunks?: number; // Totale chunk
    dosaggiCount?: number; // Numero di dosaggi estratti
    sectionsCount?: number; // Numero di sezioni
    duration?: number; // Durata in ms
    partialsCount?: number; // Numero di parziali da unire
  }
}
```

Esempi di messaggi:

- `"Input: 12345 chars (~3086 tokens estimated)"`
- `"Using model: gpt-4o"`
- `"Extracted 46 dosaggio entries"`
- `"Extracting logical chunk 2/3 with gpt-4o"`
- `"Merging with model: gpt-4o"`
- `"WARNING: Only 4 dosaggi extracted - output might be incomplete!"`

## Supporto

Per problemi o domande, contattare il team di sviluppo.
