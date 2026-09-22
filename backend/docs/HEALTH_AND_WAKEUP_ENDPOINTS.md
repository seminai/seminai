# Health Check e Wake-Up Endpoints

## Panoramica

Questo documento descrive gli endpoint di health check e wake-up implementati per supportare il deployment in modalità "pay as you go" del server backend.

## Endpoints Disponibili

### 1. `/health` - Health Check Completo

Endpoint che verifica lo stato di salute del server e di tutti i suoi servizi dipendenti.

**URL:** `GET /health`

**Autenticazione:** Non richiesta (pubblico)

**Risposta di Successo (200):**

```json
{
  "status": "success",
  "data": {
    "status": "healthy",
    "timestamp": "2025-11-13T12:00:00.000Z",
    "uptime": 123.456,
    "database": {
      "status": "connected",
      "responseTime": 45
    },
    "services": {
      "server": true,
      "prisma": true
    }
  }
}
```

**Risposta di Errore (503):**

```json
{
  "status": "error",
  "data": {
    "status": "unhealthy",
    "timestamp": "2025-11-13T12:00:00.000Z",
    "uptime": 123.456,
    "database": {
      "status": "disconnected",
      "responseTime": 0
    },
    "services": {
      "server": true,
      "prisma": false
    }
  },
  "message": "Health check failed"
}
```

### 2. `/wake-up` - Wake Up del Server

Endpoint specifico per "risvegliare" il server quando è in modalità pay-as-you-go. Questo endpoint verifica che tutti i servizi siano pronti e attivi.

**URL:** `GET /wake-up`

**Autenticazione:** Non richiesta (pubblico)

**Risposta di Successo (200):**

```json
{
  "status": "success",
  "data": {
    "message": "Server is awake and ready",
    "status": "healthy",
    "timestamp": "2025-11-13T12:00:00.000Z",
    "uptime": 123.456,
    "database": {
      "status": "connected",
      "responseTime": 45
    },
    "services": {
      "server": true,
      "prisma": true
    }
  }
}
```

**Risposta di Avvio (503):**

```json
{
  "status": "error",
  "message": "Server is starting up, please retry in a few seconds",
  "data": {
    "status": "starting",
    "timestamp": "2025-11-13T12:00:00.000Z"
  }
}
```

## Utilizzo nel Frontend

### Durante il Login

Puoi chiamare l'endpoint `/wake-up` prima o durante il processo di login per assicurarti che il server sia attivo:

```typescript
// Esempio con fetch
async function wakeUpServer(): Promise<boolean> {
  try {
    const response = await fetch('https://your-api.com/wake-up');
    const data = await response.json();
    return data.status === 'success';
  } catch (error) {
    console.error('Failed to wake up server:', error);
    return false;
  }
}

// Chiamata prima del login
async function login(email: string, password: string) {
  // Wake up del server
  const isAwake = await wakeUpServer();

  if (!isAwake) {
    // Retry dopo qualche secondo
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await wakeUpServer();
  }

  // Procedi con il login
  const response = await fetch('https://your-api.com/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  return response.json();
}
```

### Polling con Retry

Per scenari in cui il server potrebbe impiegare più tempo ad avviarsi:

```typescript
async function wakeUpServerWithRetry(
  maxRetries: number = 5,
  delayMs: number = 2000,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('https://your-api.com/wake-up');
      const data = await response.json();

      if (data.status === 'success') {
        return true;
      }

      // Se il server sta ancora partendo, attendi e riprova
      console.log(`Server starting up, retry ${i + 1}/${maxRetries}...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`Wake up attempt ${i + 1} failed:`, error);
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return false;
}
```

### Monitoraggio Periodico

Per mantenere il server attivo durante l'utilizzo dell'applicazione:

```typescript
// Chiama /health ogni 5 minuti per mantenere il server attivo
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minuti

function startHealthCheckMonitoring() {
  return setInterval(async () => {
    try {
      const response = await fetch('https://your-api.com/health');
      const data = await response.json();

      if (data.status !== 'success') {
        console.warn('Server health check failed:', data);
        // Puoi notificare l'utente o tentare un wake-up
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Avvia il monitoraggio quando l'utente effettua il login
const healthCheckInterval = startHealthCheckMonitoring();

// Ferma il monitoraggio quando l'utente effettua il logout
clearInterval(healthCheckInterval);
```

## Vantaggi

1. **Riduzione dei Costi**: Il server può essere spento quando non in uso
2. **Startup Trasparente**: Gli utenti attivano automaticamente il server quando necessario
3. **Monitoraggio**: Verifica lo stato dei servizi (database, Prisma, ecc.)
4. **Performance Tracking**: Monitora i tempi di risposta del database
5. **Documentazione Swagger**: Gli endpoint sono documentati in `/api-docs`

## Architettura

Il sistema segue l'architettura esagonale del progetto:

- **Domain Layer**: Non applicabile (logica di infrastruttura)
- **Application Layer**: `CheckHealthUseCase` - verifica lo stato dei servizi
- **Infrastructure Layer**:
  - `HealthController` - gestisce le richieste HTTP
  - `health.routes.ts` - definisce gli endpoint
  - Utilizza `PrismaClient` per verificare la connessione al database

## Note Tecniche

- Gli endpoint non richiedono autenticazione
- Il database viene testato con una query semplice (`SELECT 1`)
- I tempi di risposta sono misurati in millisecondi
- L'uptime del server è espresso in secondi
- Il codice di stato HTTP 503 indica che il servizio non è disponibile
