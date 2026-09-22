# Job Verification Agent - Live Streaming Guide — Part 1

[Back to the guide index](../JOB_VERIFICATION_AGENT_STREAMING.md)


Guida per integrare lo streaming live del "pensiero" dell'agente nel frontend.

## Come Funziona (streamEvents)

Il sistema usa `streamEvents()` di LangGraph per streaming **real-time**:

- **Token by token**: Ogni token generato dall'LLM viene inviato immediatamente
- **Tool events**: Eventi quando un tool inizia/finisce
- **Node transitions**: Notifiche quando l'agente cambia fase (planning, reasoning, tools, etc.)

Questo significa che vedrai il testo apparire carattere per carattere e i tool in tempo reale.

## Modalità Deep Thinking vs Quick

Il sistema supporta due modalità tramite il parametro `deepThinking`:

### Deep Thinking (default: `true`)

- Analisi approfondita con task planning
- Uso di tool (inspect_job_data, tavily_search, etc.)
- Verifica conformità con fonti esterne
- Streaming di thinking, tool calls, task progress
- Modello: gpt-4o (più accurato)
- Tempo: ~30-60 secondi

### Quick Mode (`deepThinking: false`)

- Parere rapido senza tool
- Singola chiamata LLM
- Risposta concisa e diretta
- Solo eventi: thinking, token, complete
- Modello: gpt-4o-mini (più veloce ed economico)
- Tempo: ~5-10 secondi

```typescript
// Esempio payload per modalità rapida
{
  "threadId": "...",
  "jobs": [...],
  "message": "È tutto ok?",
  "deepThinking": false  // <-- Modalità rapida
}
```

## Perché SSE e non WebSocket?

**SSE (Server-Sent Events) è la scelta corretta** perché:

- Comunicazione unidirezionale (server → client) - perfetto per streaming
- Reconnection automatica built-in
- Più semplice da implementare
- Nativo nei browser moderni
- Sufficiente per questo use case

**WebSocket servirebbe solo se:**

- Il client deve inviare messaggi MENTRE riceve lo stream
- Serve comunicazione bidirezionale real-time

---

## Stream Events Disponibili

### Eventi di Pensiero (Thinking)

Questi eventi vengono emessi in tempo reale mentre l'agente lavora:

```typescript
// Quando l'agente cambia fase di lavoro (node transition)
{ "type": "thinking", "thinking": "📋 Analizzo la richiesta..." }
{ "type": "thinking", "thinking": "📝 Creo un piano di lavoro..." }
{ "type": "thinking", "thinking": "🤔 Ragiono sulla prossima azione..." }
{ "type": "thinking", "thinking": "🔧 Eseguo i tool richiesti..." }
{ "type": "thinking", "thinking": "✍️ Genero la risposta finale..." }

// Progresso di un task
{ "type": "task_progress", "thinking": "Task 'Cerca disciplinari' ora è in_progress" }

// Ragionamento dell'agente
{ "type": "reasoning", "reasoning": "Ho trovato i dati nel job, ora cerco sui disciplinari..." }
```

### Eventi Tool

Gli eventi tool vengono emessi in tempo reale quando l'agente chiama i tool:

```typescript
// Quando un tool sta per essere eseguito
{
  "type": "tool_start",
  "toolCall": { "name": "tavily_search", "args": { "query": "AGIL SQNPI Emilia Romagna" } },
  "thinking": "🌐 Sto cercando informazioni su: AGIL SQNPI Emilia Romagna..."
}

// Altri esempi di thinking per tool
{ "thinking": "🔍 Sto elencando i dati disponibili nel job 0c4b4e09..." }
{ "thinking": "📖 Sto leggendo il campo \"alertNotes\" dal job 0c4b4e09..." }
{ "thinking": "🏷️ Sto estraendo i dati dall'etichetta di AGIL..." }
{ "thinking": "📚 Sto verificando i disciplinari per AGIL..." }

// Risultato di un tool
{
  "type": "tool_result",
  "toolResult": {
    "name": "tavily_search",
    "result": "...",
    "summary": "Trovate 5 fonti rilevanti"
  },
  "thinking": "Ho ricevuto i risultati da tavily_search"
}

// Ispezione dati del job
{
  "type": "data_inspection",
  "dataInspection": {
    "path": "alertNotes.dose_minima",
    "jobId": "abc-123",
    "summary": "Leggo i dati dal path: alertNotes.dose_minima"
  }
}
```

### Eventi Task

```typescript
// Lista task aggiornata
{
  "type": "task_update",
  "tasks": [
    { "id": "task_1", "description": "Ispeziona dati job", "status": "completed" },
    { "id": "task_2", "description": "Cerca disciplinari SQNPI", "status": "in_progress" }
  ],
  "currentTaskId": "task_2"
}
```

### Altri Eventi

```typescript
// Token di risposta (testo incrementale)
{ "type": "token", "content": "Il prodotto AGIL " }

// Fonti trovate
{ "type": "sources_update", "sources": [{ "url": "...", "title": "...", "description": "..." }] }

// Risposta completata
{ "type": "complete", "response": {...}, "cost": {...}, "sources": [...] }

// Errore
{ "type": "error", "error": "Messaggio errore" }
```

---

## Integrazione Frontend React

### Hook con Gestione Eventi Live
