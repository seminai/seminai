# 🗜️ Ottimizzazione Payload per Job Verification Agent

## 📋 Problema

L'endpoint `/job-verification-agent/stream` riceveva errori `PayloadTooLargeError: request entity too large` quando venivano inviati molti job con history dettagliata.

Il payload JSON può diventare molto grande (anche diversi MB) quando contiene:

- 60+ job
- History dettagliata per ogni job (10-20 entry)
- Metadata complessi (alertNotes, prodotti, campi, etc.)

## ✅ Soluzioni Implementate

### 1. **Aumento Limite Body Parser**

Il limite del body-parser è stato aumentato a **50MB** per gli endpoint `/job-verification-agent/*`:

```typescript
// src/infrastructure/http/server.ts
app.use('/job-verification-agent', express.json({ limit: '50mb' }));
```

**Nota**: Il middleware specifico deve essere definito **prima** del middleware generale per prendere precedenza.

### 2. **Compressione HTTP (Gzip)**

È stata abilitata la compressione HTTP per tutte le risposte usando il middleware `compression`:

```typescript
import compression from 'compression';

app.use(compression());
```

Questo riduce significativamente la dimensione delle risposte HTTP, specialmente per dati JSON ripetitivi.

### 3. **Ottimizzazione Payload (History Reduction)**

È stato creato un middleware che riduce automaticamente la dimensione della history mantenendo solo le ultime 10 entry:

```typescript
// src/infrastructure/http/middlewares/optimizeJobPayload.ts
export function optimizeJobPayload(req: Request, res: Response, next: NextFunction);
```

**Comportamento**:

- Mantiene solo le ultime 10 entry della history per ogni job
- Logga la riduzione percentuale del payload
- Applicato automaticamente agli endpoint `/stream` e `/message`

**Esempio di riduzione**:

```
[PAYLOAD-OPTIMIZATION] Reduced payload by 45.23% (2345.67KB -> 1284.12KB)
```

## 🔧 Configurazione

### Middleware Order

L'ordine dei middleware è critico:

1. **Compression** (prima di tutto)
2. **CORS**
3. **Body parser specifico** per `/job-verification-agent` (50MB)
4. **Body parser generale** (100KB)
5. **Cookie parser**
6. **Rate limiter**

### Applicazione Middleware

Il middleware di ottimizzazione è applicato alle route:

```typescript
jobVerificationAgentRouter.post(
  '/stream',
  ensureAuthenticated,
  optimizeJobPayload, // ← Ottimizza il payload
  asyncHandler(controller.stream.bind(controller)),
);
```

## 📊 Performance

### Prima dell'Ottimizzazione

- **Limite body-parser**: 100KB (default)
- **Errore**: `PayloadTooLargeError` per payload > 100KB
- **History completa**: Tutte le entry venivano inviate

### Dopo l'Ottimizzazione

- **Limite body-parser**: 50MB per job-verification-agent
- **Compressione**: Riduzione automatica delle risposte
- **History ottimizzata**: Solo ultime 10 entry per job
- **Riduzione tipica**: 40-60% della dimensione del payload

## 🚀 Future Improvements

Possibili miglioramenti futuri:

1. **Vector Database per History**

   - Salvare la history completa nel vector database opzionale Qdrant
   - Inviare solo riferimenti (IDs) nel payload
   - Recuperare history on-demand quando necessario

2. **Streaming Compression**

   - Comprimere il payload lato client prima dell'invio
   - Decomprimere lato server

3. **Pagination**

   - Dividere job in batch più piccoli
   - Processare in modo incrementale

4. **Selective History**
   - Mantenere solo history rilevante per il contesto
   - Filtrare entry non necessarie

## ⚠️ Note

- Il limite di 50MB è generoso ma necessario per casi edge con molti job
- La compressione HTTP funziona solo per le **risposte**, non per le richieste
- Il middleware di ottimizzazione riduce la history ma mantiene i dati essenziali
- Per payload ancora più grandi, considerare l'uso di un vector database

## 🔍 Troubleshooting

### Errore: "PayloadTooLargeError" ancora presente

**Causa**: Il payload supera ancora 50MB anche dopo l'ottimizzazione

**Soluzione**:

1. Verificare che il middleware `optimizeJobPayload` sia applicato
2. Ridurre ulteriormente `maxHistoryEntries` nel middleware
3. Considerare l'uso di un vector database per la history

### Compressione non funziona

**Causa**: Il client non supporta gzip o non invia header `Accept-Encoding`

**Soluzione**: Il middleware `compression` gestisce automaticamente i client che non supportano compressione

## 📝 Riferimenti

- [Express Body Parser Limits](https://expressjs.com/en/api.html#express.json)
- [Compression Middleware](https://github.com/expressjs/compression)
- [Redis Compression System](./REDIS_COMPRESSION.md) - Sistema simile per Redis
