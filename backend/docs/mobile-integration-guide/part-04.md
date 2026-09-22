# Guida Integrazione Mobile - Seminai API — Part 4

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)

```typescript
const formData = new FormData();
formData.append('threadId', threadId);
formData.append('message', 'Analizza questa foto del campo');
formData.append('file', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'campo.jpg',
});

const response = await fetch(`${BASE_URL}/field-note-agent/stream`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

#### Approvare/Rifiutare

```typescript
// Approvare un'azione pendente
await apiClient.request('/field-note-agent/approve', {
  method: 'POST',
  body: JSON.stringify({ threadId: 'uuid-conversazione' }),
});

// Rifiutare con feedback
await apiClient.request('/field-note-agent/reject', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
    feedback: 'Il campo non &egrave; quello, &egrave; il campo olivo',
  }),
});
```

#### Stato conversazione

**GET** `/field-note-agent/state/:threadId`

```typescript
const response = await apiClient.request(`/field-note-agent/state/${threadId}`);

// Response 200
{
  "status": "success",
  "data": {
    "messages": [ /* cronologia messaggi */ ],
    "pendingAction": null  // o { tool, args, description }
  }
}
```

---

## 4. Dosage Agent ReAct (Chat AI)

L'agente dosaggi &egrave; un assistente agronomico AI che aiuta a pianificare, validare ed eseguire trattamenti fitosanitari. Comunica in tempo reale via SSE.

### 4.1 Streaming Chat (Endpoint principale)

**POST** `/agent-chat/stream`

```typescript
const response = await fetch(`${BASE_URL}/agent-chat/stream`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    threadId: 'uuid-conversazione', // UUID unico per conversazione
    message: 'Pianifica un trattamento con poltiglia bordolese per la mia vite',
    modelName: 'gpt-4o', // Opzionale: gpt-4o | gpt-4o-mini | gpt-4-turbo
    temperature: 0, // Opzionale: 0-1
    jobId: 'job-uuid', // Opzionale: collega a un job esistente per contesto RAG
    workspaceId: 'ws-uuid', // Opzionale: scope per ricerca regole
  }),
});
```

### 4.2 Tipi di Evento SSE

```typescript
// 1. Token testuale - aggregare per costruire il messaggio
data: {"type":"token","content":"Analizzo"}
data: {"type":"token","content":" i prodotti"}

// 2. Chiamata a tool - mostrare indicatore "l'agente sta lavorando"
data: {"type":"tool_call","toolCall":{"name":"search_products","args":{...},"id":"call_123"}}

// 3. Risultato tool
data: {"type":"tool_result","content":"Trovati 3 prodotti compatibili..."}

// 4. Richiesta approvazione - mostrare dialog conferma
data: {"type":"requires_approval","toolCall":{"name":"create_treatment_jobs","args":{...}}}

// 5. Questionario - mostrare domande interattive
data: {"type":"questionnaire","questionnaire":{"id":"q1","questions":[...]}}

// 6. Piano di trattamento - mostrare piano strutturato
data: {"type":"plan","plan":{"id":"plan-1","steps":[...],"status":"draft"}}

// 7. Completamento turno
data: {"type":"complete","sources":[...],"cost":{"totalTokens":1500,"totalCost":0.05},"response":{...}}

// 8. Errore
data: {"type":"error","error":"Messaggio di errore"}
```

### 4.3 Parsing SSE in React Native

```typescript
async function streamChat(
  threadId: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
) {
  const token = await SecureStorage.get('auth_token');

  const response = await fetch(`${BASE_URL}/agent-chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ threadId, message }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Ultimo frammento incompleto

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // Ignorare linee malformate
        }
      }
    }
  }
}

// Uso
streamChat(threadId, 'Pianifica trattamento rame', (event) => {
  switch (event.type) {
    case 'token':
      setMessage((prev) => prev + event.content);
      break;
    case 'tool_call':
      setIsThinking(true);
      setCurrentTool(event.toolCall.name);
      break;
    case 'requires_approval':
      setIsThinking(false);
      setPendingApproval(event);
      break;
    case 'complete':
      setIsThinking(false);
      setSources(event.sources);
      setCost(event.cost);
      break;
    case 'error':
      setError(event.error);
      break;
  }
});
```

### 4.4 Messaggio Non-Streaming

**POST** `/agent-chat/message`

Alternativa sincrona allo streaming. Timeout: 180 secondi.

```typescript
const response = await apiClient.request('/agent-chat/message', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
    message: 'Quali prodotti ho disponibili per la vite?'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "status": "COMPLETED",           // COMPLETED | REQUIRES_APPROVAL | ERROR
    "message": "Ecco i prodotti disponibili per la vite: ...",
    "pendingToolCalls": null,         // Presente solo se REQUIRES_APPROVAL
    "sources": [
      { "title": "Etichetta Poltiglia", "url": "..." }
    ]
  }
}
```

### 4.5 Approvare / Rifiutare Azioni

Operazioni distruttive (creazione job, aziende, campi) richiedono approvazione esplicita.

**POST** `/agent-chat/approve`

```typescript
const response = await apiClient.request('/agent-chat/approve', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
  }),
});
// L'agente procede con l'azione e restituisce il risultato via streaming/JSON
```

**POST** `/agent-chat/reject`

```typescript
const response = await apiClient.request('/agent-chat/reject', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'uuid-conversazione',
    reason: 'Vorrei usare una dose minore',
  }),
});
// L'agente rivede l'azione in base al feedback
```

### 4.6 Stato Conversazione

**GET** `/agent-chat/state/:threadId`
