# Field Note Agent API - Guida Completa — Part 1

[Back to the guide index](../FIELD_NOTE_AGENT_API.md)


## Endpoints Disponibili

### 1. POST `/field-note-agent/stream` - Chat con Streaming (SSE)

**Vedere il "pensiero" live dell'agent in tempo reale**

```bash
# Con streaming - Vedi token by token
curl -N -X POST http://localhost:3000/field-note-agent/stream \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-123",
    "message": "ho dato 10 kg di rame nel campo vite ieri mattina",
    "modelName": "gpt-4o",
    "temperature": 0.1
  }'
```

**Output Streaming (Server-Sent Events):**

```
data: {"type":"token","content":"Analizzo"}
data: {"type":"token","content":" la"}
data: {"type":"token","content":" tua"}
data: {"type":"token","content":" nota..."}
data: {"type":"tool_call","toolCall":{"name":"classify_field_note_data","args":{"rawContent":"ho dato 10 kg di rame nel campo vite ieri mattina"},"id":"call_123"}}
data: {"type":"token","content":"Ho classificato"}
data: {"type":"token","content":" la nota:"}
data: {"type":"token","content":"\n\n**Categoria**: OPERATION"}
data: {"type":"requires_approval","toolCall":{"name":"classify_field_note_data","args":{...}}}
```

### 2. POST `/field-note-agent/message` - Chat Senza Streaming

```bash
# Senza streaming - Risposta completa alla fine
curl -X POST http://localhost:3000/field-note-agent/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-123",
    "message": "ho notato peronospora nel vigneto nord",
    "modelName": "gpt-4o"
  }'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "status": "REQUIRES_APPROVAL",
    "message": "Ho classificato la tua osservazione...",
    "pendingToolCalls": [
      {
        "name": "classify_field_note_data",
        "args": {
          "rawContent": "ho notato peronospora nel vigneto nord"
        },
        "id": "call_abc123"
      }
    ]
  }
}
```

### 3. POST `/field-note-agent/approve` - Approva Tool

```bash
# Approva l'esecuzione del tool pendente
curl -X POST http://localhost:3000/field-note-agent/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-123"
  }'
```

### 4. POST `/field-note-agent/reject` - Rifiuta e Correggi

```bash
# Rifiuta e fornisci feedback correttivo
curl -X POST http://localhost:3000/field-note-agent/reject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-123",
    "feedback": "No, il campo era vigneto sud, non campo vite"
  }'
```

### 5. GET `/field-note-agent/state/:threadId` - Stato Conversazione

```bash
# Ottieni lo stato attuale della conversazione
curl -X GET "http://localhost:3000/field-note-agent/state/thread-123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Esempi Completi di Workflow

### Scenario 1: Nota semplice con streaming

```bash
# 1. Invia nota con streaming
curl -N -X POST http://localhost:3000/field-note-agent/stream \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "my-session-001",
    "message": "ho dato 5 litri di concime liquido nel campo pomodori"
  }'

# Output:
# data: {"type":"token","content":"Sto analizzando la tua nota..."}
# data: {"type":"tool_call","toolCall":{"name":"classify_field_note_data",...}}
# data: {"type":"token","content":"Ho classificato come OPERATION"}
# data: {"type":"requires_approval",...}

# 2. Approva
curl -X POST http://localhost:3000/field-note-agent/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threadId": "my-session-001"}'

# Output:
# {
#   "status": "success",
#   "data": {
#     "status": "COMPLETED",
#     "message": "Perfetto! Ho trovato: Campo 'pomodori' (ID: xyz), Prodotto 'concime liquido' (ID: abc)..."
#   }
# }
```

### Scenario 2: Nota ambigua con correzione

```bash
# 1. Nota ambigua
curl -X POST http://localhost:3000/field-note-agent/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "session-002",
    "message": "ho dato del prodotto nel campo"
  }'

# Output: Agent chiede chiarimenti

# 2. Fornisci dettagli
curl -X POST http://localhost:3000/field-note-agent/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "session-002",
    "message": "era rame bordolese, 8 kg nel vigneto rosso"
  }'

# 3. Approva classificazione
curl -X POST http://localhost:3000/field-note-agent/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threadId": "session-002"}'
```

### Scenario 3: Correzione con reject

```bash
# 1. Prima classificazione
curl -X POST http://localhost:3000/field-note-agent/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "session-003",
    "message": "ho trattato il campo con 10 kg di prodotto"
  }'

# Output: Suggerisce campo sbagliato

# 2. Correggi con reject
curl -X POST http://localhost:3000/field-note-agent/reject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "session-003",
    "feedback": "No, il campo era vigneto sud, non campo vite"
  }'

# L'agent riclassifica con il feedback

# 3. Approva la versione corretta
curl -X POST http://localhost:3000/field-note-agent/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threadId": "session-003"}'
```

## Event Types nello Streaming

| Type                | Descrizione                      | Esempio                                 |
| ------------------- | -------------------------------- | --------------------------------------- |
| `token`             | Token singolo del pensiero       | `{"type":"token","content":"Sto"}`      |
| `tool_call`         | Tool che sta per essere chiamato | `{"type":"tool_call","toolCall":{...}}` |
| `tool_result`       | Risultato del tool               | `{"type":"tool_result",...}`            |
| `requires_approval` | Richiede approvazione            | `{"type":"requires_approval",...}`      |
| `complete`          | Conversazione completata         | `{"type":"complete","response":{...}}`  |
| `error`             | Errore                           | `{"type":"error","error":"..."}`        |

## Come Consumare lo Streaming (JavaScript)

```javascript
// Browser/Frontend
const eventSource = new EventSource('http://localhost:3000/field-note-agent/stream', {
  headers: {
    Authorization: 'Bearer YOUR_TOKEN',
  },
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'token':
      // Aggiungi token al display
      displayElement.textContent += data.content;
      break;

    case 'tool_call':
      console.log('Tool chiamato:', data.toolCall.name);
      break;

    case 'requires_approval':
      // Mostra UI per approvazione
      showApprovalDialog(data.toolCall);
      break;

    case 'complete':
      console.log('Completato!', data.response);
      eventSource.close();
      break;

    case 'error':
      console.error('Errore:', data.error);
      eventSource.close();
      break;
  }
};
```

## Redis vs MemorySaver - Quando Usare Cosa

### ✅ MemorySaver (Attuale - In-Memory)

**Pro:**
