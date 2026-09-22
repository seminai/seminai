# Field Note Agent API - Guida Completa — Part 2

[Back to the guide index](../FIELD_NOTE_AGENT_API.md)

- Zero configurazione
- Velocissimo (tutto in RAM)
- Perfetto per sviluppo e test
- Nessuna dipendenza esterna

**Contro:**

- ❌ Stato perso al restart del server
- ❌ Non funziona con multiple istanze (no load balancing)
- ❌ RAM limitata per conversazioni lunghe

**Quando usare:**

- Sviluppo locale
- Test
- Demo
- Single instance deployment
- Conversazioni brevi

### ✅ Redis (Per Produzione)

**Pro:**

- ✅ Stato persistente (survives restart)
- ✅ Funziona con load balancer (multiple istanze)
- ✅ Può gestire milioni di conversazioni
- ✅ TTL automatico per pulizia

**Contro:**

- Richiede Redis server
- Latency leggermente maggiore
- Configurazione extra

**Quando usare:**

- Produzione
- Multiple server instances
- Conversazioni lunghe/persistenti
- Scaling orizzontale

### Come Implementare Redis

1. Installa dipendenza:

```bash
npm install @langchain/langgraph-checkpoint-redis ioredis
```

2. Modifica `graph.ts`:

```typescript
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';
import Redis from 'ioredis';

// Invece di MemorySaver
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const checkpointer = new RedisSaver(redis);

return workflow.compile({
  checkpointer,
  interruptBefore: ['tools'],
});
```

3. Configurazione Redis:

```bash
# .env
REDIS_URL=redis://localhost:6379
# O per produzione:
REDIS_URL=redis://:password@redis.example.com:6379/0
```

### Confronto Performance

| Scenario    | MemorySaver | Redis     |
| ----------- | ----------- | --------- |
| Latency     | ~5ms        | ~10-20ms  |
| Throughput  | 10K req/s   | 5K req/s  |
| Persistenza | No          | Si        |
| Scalabilità | 1 istanza   | N istanze |
| RAM Usage   | Alta        | Bassa     |

### Raccomandazione

**Per questo progetto:**

- ✅ **MemorySaver** per ora (già implementato)
- ✅ Passa a **Redis** quando:
  - Deploy in produzione con >1 istanza
  - Utenti si lamentano di conversazioni perse
  - Hai bisogno di analytics sulle conversazioni
  - Vuoi implementare rate limiting persistente

## Environment Variables

```bash
# .env
OPENAI_API_KEY=sk-...          # Richiesto
DATABASE_URL=postgresql://...  # Richiesto
REDIS_URL=redis://...          # Opzionale (solo se usi Redis)
```

## Errori Comuni

### 401 Unauthorized

```bash
# Manca il token
curl -X POST http://localhost:3000/field-note-agent/message \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \  # ← Aggiungi questo
  -H "Content-Type: application/json" \
  -d '{"threadId":"test","message":"hello"}'
```

### 400 Missing threadId

```bash
# threadId è obbligatorio e deve essere univoco per conversazione
-d '{"threadId":"unique-id-123","message":"..."}'
```

### No streaming data

```bash
# Usa -N per disable buffering
curl -N -X POST ...  # ← Il -N è importante per SSE
```

## Testing Locale

```bash
# 1. Avvia il server
npm run dev

# 2. Testa streaming con curl
curl -N -X POST http://localhost:3000/field-note-agent/stream \
  -H "Authorization: Bearer $(cat .token)" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "test-'$(date +%s)'",
    "message": "ho dato 10 kg di rame nel campo vite"
  }'

# 3. Osserva lo streaming in tempo reale!
```

## Prossimi Step

1. ✅ Test con Postman/Insomnia (per SSE streaming)
2. ✅ Integrare in frontend con EventSource
3. ⏳ Implementare salvataggio field note dopo approvazione
4. ⏳ Aggiungere Redis per produzione (quando necessario)
5. ⏳ Analytics sulle classificazioni AI
