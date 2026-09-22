# Dosage Agent Real-Time Log Streaming — Part 2

[Back to the guide index](../DOSAGE_AGENT_STREAMING.md)

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
