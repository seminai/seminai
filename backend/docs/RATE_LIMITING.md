# 🚦 Rate Limiting API

## 📋 Panoramica

Il sistema implementa rate limiting a due livelli per proteggere l'API da abusi e garantire una distribuzione equa delle risorse:

1. **Rate Limiting Globale (per IP)** - Applicato a tutte le richieste
2. **Rate Limiting per Utente** - Applicato agli endpoint che avviano job pesanti

## ⚙️ Configurazione

### Limiti per Categoria

| Categoria    | Limite   | Periodo  | Identificatore | Endpoint                                                                                         |
| ------------ | -------- | -------- | -------------- | ------------------------------------------------------------------------------------------------ |
| Default      | 300 req  | 1 minuto | IP             | Tutti gli endpoint non specificati                                                               |
| Job Status   | 1000 req | 1 minuto | IP             | `/*/job-status/*`                                                                                |
| Start Job    | 10 req   | 1 minuto | User ID        | `/dosage-agent/start-job`, `/conformity-checker/start-job`, `/fields/start-job-field-extraction` |
| Bulk Extract | 5 req    | 1 minuto | User ID        | `/labels/bulk-pdf-label*`                                                                        |

### Headers di Risposta

Ogni risposta include headers informativi sul rate limiting:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1705401234567
```

## 🔒 Rate Limiting Globale (per IP)

Applicato automaticamente a tutte le richieste prima dell'autenticazione.

```typescript
// Esempio di risposta quando il limite è raggiunto
{
  "status": "error",
  "message": "Too many requests. Please try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

**Header HTTP**: `429 Too Many Requests`

## 👤 Rate Limiting per Utente

Applicato agli endpoint che avviano operazioni costose (job asincroni, estrazione etichette).

### Endpoint Protetti

#### Start Job (10 req/min per utente)

- `POST /dosage-agent/start-job`
- `POST /conformity-checker/start-job`
- `POST /fields/start-job-field-extraction`

#### Bulk Extract (5 req/min per utente)

- `POST /labels/bulk-pdf-label`
- `POST /labels/bulk-pdf-label-async`
- `POST /labels/bulk-pdf-label-fertilizer-async`

```typescript
// Esempio di risposta quando il limite utente è raggiunto
{
  "status": "error",
  "message": "Rate limit exceeded. You can only make 10 requests per minute for this operation.",
  "code": "USER_RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

## 📦 Implementazione

### Struttura dei File

```
src/infrastructure/http/middlewares/
└── rateLimiter.ts          # Middleware di rate limiting
```

### Middleware Disponibili

```typescript
import {
  rateLimiter, // Middleware globale (applicato automaticamente)
  startJobRateLimiter, // Per endpoint che avviano job
  bulkExtractRateLimiter, // Per endpoint di estrazione bulk
  createUserRateLimiter, // Factory per creare rate limiter custom
} from '../middlewares/rateLimiter';
```

### Utilizzo nelle Route

```typescript
// Esempio: proteggere un endpoint con rate limiting per utente
router.post(
  '/my-expensive-endpoint',
  ensureAuthenticated, // Prima: autenticazione
  startJobRateLimiter, // Poi: rate limiting per utente
  asyncHandler(controller.myMethod),
);
```

### Creare un Rate Limiter Custom

```typescript
import { createUserRateLimiter } from '../middlewares/rateLimiter';

// Crea un rate limiter: 3 req/min per utente, categoria "custom-operation"
const customRateLimiter = createUserRateLimiter(3, 60000, 'custom-operation');

router.post('/custom', ensureAuthenticated, customRateLimiter, handler);
```

## 🧪 Testing

### Testare il Rate Limiting

```bash
# Esegui 15 richieste rapide per verificare il rate limiting
for i in {1..15}; do
  curl -X POST http://localhost:8081/dosage-agent/start-job \
    -H "Cookie: auth_token=YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"products": [], "unitOfProduction": []}' &
done
wait

# Le prime 10 richieste avranno successo, le successive riceveranno 429
```

### Verificare gli Headers

```bash
curl -I -X POST http://localhost:8081/dosage-agent/start-job \
  -H "Cookie: auth_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Risposta include:
# X-RateLimit-Limit: 10
# X-RateLimit-Remaining: 9
```

## 📊 Logging

Il sistema logga automaticamente quando un rate limit viene superato:

```
[RATE-LIMIT] Rate limit exceeded for start-job: user:uuid-123 (10/10)
[RATE-LIMIT] User rate limit exceeded for bulk-extract: user:uuid-456 (5/5)
```

## 🔧 Configurazione Avanzata

### Modificare i Limiti

In `rateLimiter.ts`:

```typescript
const DEFAULT_LIMIT = 300; // Richieste generiche
const JOB_STATUS_LIMIT = 1000; // Polling job status
const START_JOB_LIMIT = 10; // Avvio job
const BULK_EXTRACT_LIMIT = 5; // Estrazione etichette
const DEFAULT_TTL_MS = 60 * 1000; // 1 minuto
```

### Aumentare la Cache

```typescript
const limiter = new LRUCache<string, number>({
  max: 5000, // Numero massimo di chiavi tracciate
  ttl: DEFAULT_TTL_MS,
});
```

## ⚠️ Best Practices

1. **Non fare retry automatici aggressivi** - Rispetta il `Retry-After` header
2. **Implementa backoff esponenziale** - Aumenta il delay tra i retry
3. **Usa batch operations** - Invece di 10 chiamate singole, raggruppa in una
4. **Monitora i 429** - Un alto numero di 429 indica che i limiti sono troppo bassi o c'è un abuso

## 🔍 Troubleshooting

### "Rate limit exceeded" su endpoint autenticati

**Causa**: Hai superato il limite per utente (es. 10 job/min)

**Soluzione**: Attendi che il periodo scada (1 minuto) o ottimizza le chiamate

### "Rate limit exceeded" prima dell'autenticazione

**Causa**: Il tuo IP ha superato il limite globale (300 req/min)

**Soluzione**: Verifica che non ci siano script che fanno troppe richieste

### Headers mancanti

**Causa**: La richiesta non è passata dal middleware

**Soluzione**: Verifica che il middleware sia configurato correttamente

## 📈 Future Improvements

- [ ] Redis-based rate limiting per cluster multi-istanza
- [ ] Rate limiting differenziato per piano utente (free/pro/enterprise)
- [ ] Dashboard per monitorare rate limit violations
- [ ] Whitelist per IP/utenti fidati
