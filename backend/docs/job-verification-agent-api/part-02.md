# Job Verification Agent API — Part 2

[Back to the guide index](../JOB_VERIFICATION_AGENT_API.md)

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "L'intervallo di sicurezza (tempo di carenza) per Ridomil Gold MZ sulla vite è di 28 giorni dalla raccolta.",
    "reasoning": "Informazione estratta dall'etichetta ufficiale del prodotto.",
    "tasks": [
      {
        "id": "task_1",
        "description": "Cercare intervallo di sicurezza nell'etichetta",
        "status": "completed"
      }
    ],
    "sources": [
      {
        "url": "https://sian.it/etichette/12345.pdf",
        "title": "Etichetta Ridomil Gold MZ",
        "description": "Intervallo di sicurezza vite: 28 giorni"
      }
    ]
  }
}
```

### 3. Richiesta di Modifica (Richiede Approvazione)

```bash
curl -X POST "https://api.example.com/job-verification-agent/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "jobs": [...],
    "message": "Modifica la quantità del primo job da 2.5 a 2.0 L/ha"
  }'
```

**Risposta (SSE stream):**

```
data: {"type":"tool_call","toolCall":{"name":"propose_job_modification","args":{"jobId":"job-123","field":"quantity","oldValue":"2.5","newValue":"2.0","reason":"Richiesta utente"}}}

data: {"type":"requires_modification_approval","pendingAction":{"type":"job_modification","tool":"propose_job_modification","args":{"jobId":"job-123","field":"quantity","oldValue":"2.5","newValue":"2.0","reason":"Richiesta utente"},"description":"Modifica proposta: quantity da 2.5 a 2.0"}}

```

### 4. Approvare una Modifica

```bash
curl -X POST "https://api.example.com/job-verification-agent/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "modification": {
      "jobId": "job-123",
      "field": "quantity",
      "newValue": 2.0
    }
  }'
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "La modifica è stata applicata con successo. Il campo 'quantity' del job è stato aggiornato da 2.5 a 2.0. Nota: il job è stato marcato come conformityChecked=false.",
    "sources": []
  }
}
```

### 5. Rifiutare un'Azione

```bash
curl -X POST "https://api.example.com/job-verification-agent/reject" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "Preferisco mantenere il dosaggio originale"
  }'
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "Ho preso nota che preferisci mantenere il dosaggio originale di 2.5 L/ha. Posso aiutarti con altro?",
    "sources": []
  }
}
```

### 6. Ottenere Stato Conversazione

```bash
curl -X GET "https://api.example.com/job-verification-agent/state/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <TOKEN>"
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "messages": [...],
    "jobs": [...],
    "tasks": [...],
    "sources": [...],
    "reasoning": "...",
    "requiresHumanInput": false
  }
}
```

---

## Integrazione Frontend

### React/TypeScript Example
