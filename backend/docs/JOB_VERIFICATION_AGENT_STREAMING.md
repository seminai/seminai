# Job Verification Agent - Live Streaming Guide

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

```typescript
import { useCallback, useState, useRef } from 'react';

interface ThinkingStep {
  id: string;
  type: 'thinking' | 'tool_start' | 'tool_result' | 'data_inspection' | 'task_progress';
  message: string;
  timestamp: Date;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
}

interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export function useJobVerificationAgentLive(threadId: string, jobs: JobWithAssignmentDTO[]) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [currentTasks, setCurrentTasks] = useState<AgentTask[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<SourceCitation[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addThinkingStep = useCallback((step: Omit<ThinkingStep, 'id' | 'timestamp'>) => {
    setThinkingSteps((prev) => [
      ...prev,
      {
        ...step,
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      // Abort previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setThinkingSteps([]); // Reset thinking steps for new message
      setMessages((prev) => [...prev, { role: 'user', content: message }]);

      try {
        const response = await fetch('/api/job-verification-agent/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ threadId, jobs, message }),
          signal: abortControllerRef.current.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                // === EVENTI DI PENSIERO ===
                case 'thinking':
                  addThinkingStep({
                    type: 'thinking',
                    message: event.thinking,
                  });
                  break;

                case 'task_progress':
                  addThinkingStep({
                    type: 'task_progress',
                    message: event.thinking,
                  });
                  break;

                case 'reasoning':
                  addThinkingStep({
                    type: 'thinking',
                    message: event.reasoning,
                  });
                  break;

                // === EVENTI TOOL ===
                case 'tool_start':
                  addThinkingStep({
                    type: 'tool_start',
                    message: event.thinking || `Eseguo ${event.toolCall?.name}...`,
                    toolName: event.toolCall?.name,
                    toolArgs: event.toolCall?.args,
                  });
                  break;

                case 'tool_call':
                  // Compatibilità con vecchio formato
                  if (!thinkingSteps.some((s) => s.toolName === event.toolCall?.name)) {
                    addThinkingStep({
                      type: 'tool_start',
                      message: `Chiamo ${event.toolCall?.name}...`,
                      toolName: event.toolCall?.name,
                      toolArgs: event.toolCall?.args,
                    });
                  }
                  break;

                case 'tool_result':
                  addThinkingStep({
                    type: 'tool_result',
                    message: event.toolResult?.summary || 'Risultato ricevuto',
                    toolName: event.toolResult?.name,
                    toolResult: event.toolResult?.result,
                  });
                  break;

                case 'data_inspection':
                  addThinkingStep({
                    type: 'data_inspection',
                    message: event.dataInspection?.summary || `Leggo ${event.dataInspection?.path}`,
                  });
                  break;

                // === EVENTI TASK ===
                case 'task_update':
                  setCurrentTasks(event.tasks || []);
                  if (event.currentTaskId) {
                    setCurrentTaskId(event.currentTaskId);
                  }
                  break;

                // === EVENTI SOURCES ===
                case 'sources_update':
                  setSources(event.sources || []);
                  break;

                // === TOKEN RISPOSTA ===
                case 'token':
                  assistantContent += event.content || '';
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.content = assistantContent;
                    } else {
                      updated.push({ role: 'assistant', content: assistantContent });
                    }
                    return updated;
                  });
                  break;

                // === COMPLETAMENTO ===
                case 'complete':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.sources = event.sources;
                      lastMsg.cost = event.cost;
                    }
                    return updated;
                  });
                  setSources(event.sources || []);
                  break;

                case 'error':
                  console.error('Agent error:', event.error);
                  addThinkingStep({
                    type: 'thinking',
                    message: `Errore: ${event.error}`,
                  });
                  break;
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Stream error:', error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [threadId, jobs, addThinkingStep],
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    thinkingSteps,
    currentTasks,
    currentTaskId,
    isLoading,
    sources,
    sendMessage,
    cancelRequest,
  };
}
```

---

## Componente UI con Pensiero Live

```tsx
import { motion, AnimatePresence } from 'framer-motion';

function ThinkingPanel({ steps, isLoading }: { steps: ThinkingStep[]; isLoading: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
        {isLoading && <span className="animate-pulse">🧠</span>}
        Pensiero dell'agente
      </h3>

      <AnimatePresence>
        {steps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`text-sm mb-2 p-2 rounded ${getStepStyle(step.type)}`}
          >
            <div className="flex items-start gap-2">
              <span>{getStepIcon(step.type)}</span>
              <div className="flex-1">
                <p className="text-gray-700">{step.message}</p>
                {step.toolName && (
                  <code className="text-xs bg-gray-200 px-1 rounded">{step.toolName}</code>
                )}
              </div>
              <span className="text-xs text-gray-400">{step.timestamp.toLocaleTimeString()}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {isLoading && steps.length === 0 && (
        <div className="flex items-center gap-2 text-gray-500">
          <span className="animate-spin">⏳</span>
          Inizializzazione...
        </div>
      )}
    </div>
  );
}

function getStepIcon(type: ThinkingStep['type']): string {
  switch (type) {
    case 'thinking':
      return '💭';
    case 'tool_start':
      return '🔧';
    case 'tool_result':
      return '✅';
    case 'data_inspection':
      return '🔍';
    case 'task_progress':
      return '📋';
    default:
      return '•';
  }
}

function getStepStyle(type: ThinkingStep['type']): string {
  switch (type) {
    case 'thinking':
      return 'bg-blue-50 border-l-2 border-blue-300';
    case 'tool_start':
      return 'bg-yellow-50 border-l-2 border-yellow-300';
    case 'tool_result':
      return 'bg-green-50 border-l-2 border-green-300';
    case 'data_inspection':
      return 'bg-purple-50 border-l-2 border-purple-300';
    case 'task_progress':
      return 'bg-gray-100 border-l-2 border-gray-300';
    default:
      return 'bg-gray-50';
  }
}
```

---

## Componente Task Progress

```tsx
function TaskProgress({
  tasks,
  currentTaskId,
}: {
  tasks: AgentTask[];
  currentTaskId: string | null;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">Piano di lavoro</h3>

      <div className="space-y-2">
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className={`flex items-center gap-3 p-2 rounded ${
              task.id === currentTaskId ? 'bg-blue-50 border border-blue-200' : ''
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                task.status === 'completed'
                  ? 'bg-green-500 text-white'
                  : task.status === 'in_progress'
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-gray-200 text-gray-600'
              }`}
            >
              {task.status === 'completed'
                ? '✓'
                : task.status === 'in_progress'
                  ? '...'
                  : index + 1}
            </div>

            <span
              className={`text-sm ${
                task.status === 'completed'
                  ? 'text-gray-500 line-through'
                  : task.status === 'in_progress'
                    ? 'text-blue-700 font-medium'
                    : 'text-gray-700'
              }`}
            >
              {task.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Esempio Completo

```tsx
function JobVerificationChat({ jobs }: { jobs: JobWithAssignmentDTO[] }) {
  const threadId = useMemo(() => `job-verification-${Date.now()}`, []);
  const {
    messages,
    thinkingSteps,
    currentTasks,
    currentTaskId,
    isLoading,
    sources,
    sendMessage,
    cancelRequest,
  } = useJobVerificationAgentLive(threadId, jobs);

  const [input, setInput] = useState('');
  const [showThinking, setShowThinking] = useState(true);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">Verifica Job</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showThinking}
            onChange={(e) => setShowThinking(e.target.checked)}
          />
          Mostra pensiero
        </label>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Task Progress */}
        {currentTasks.length > 0 && (
          <TaskProgress tasks={currentTasks} currentTaskId={currentTaskId} />
        )}

        {/* Thinking Panel */}
        {showThinking && (thinkingSteps.length > 0 || isLoading) && (
          <ThinkingPanel steps={thinkingSteps} isLoading={isLoading} />
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-4 rounded-lg ${
              msg.role === 'user' ? 'bg-blue-100 ml-8' : 'bg-white border mr-8'
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>

            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium text-gray-600">Fonti:</p>
                <ul className="mt-1 space-y-1">
                  {msg.sources.map((source, j) => (
                    <li key={j} className="text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        {source.title}
                      </a>
                      {source.description && (
                        <span className="text-gray-500"> - {source.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage(input.trim());
            setInput('');
          }
        }}
        className="p-4 border-t"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Fai una domanda sui job..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={cancelRequest}
              className="px-4 py-2 bg-red-600 text-white rounded-lg"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              Invia
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
```

---

## Note Tecniche

### Buffering SSE

Il server usa `res.flushHeaders()` e flush dopo ogni write per evitare buffering. Se gli eventi non arrivano in tempo reale, verifica:

1. **Proxy/Load Balancer**: Disabilita buffering (es. nginx: `proxy_buffering off;`)
2. **Cloudflare**: Può bufferizzare - usa WebSocket se necessario
3. **Browser**: Alcuni browser bufferizzano - usa `EventSource` API

### EventSource API (alternativa)

```typescript
const eventSource = new EventSource(`/api/stream?threadId=${threadId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle event
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};
```

### Headers Importanti

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no  # Per nginx
```

---

## Flusso Tipico degli Eventi

Ecco l'ordine tipico degli eventi durante una richiesta:

```
1. thinking: "📋 Analizzo la richiesta..."
2. thinking: "📝 Creo un piano di lavoro..."
3. task_update: [lista dei task creati]
4. thinking: "🤔 Ragiono sulla prossima azione..."
5. tool_start: { name: "list_job_paths", ... }
   thinking: "🔍 Sto elencando i dati disponibili..."
6. tool_result: { name: "list_job_paths", summary: "Trovati 45 path disponibili" }
7. tool_start: { name: "inspect_job_data", args: { path: "alertNotes" } }
   thinking: "📖 Sto leggendo il campo \"alertNotes\"..."
8. tool_result: { name: "inspect_job_data", ... }
9. task_progress: "Task 'Ispeziona dati' ora è completed"
10. thinking: "🤔 Ragiono sulla prossima azione..."
11. tool_start: { name: "tavily_search", args: { query: "AGIL SQNPI..." } }
    thinking: "🌐 Sto cercando informazioni su: AGIL SQNPI..."
12. tool_result: { name: "tavily_search", ... }
13. sources_update: [lista fonti trovate]
14. thinking: "✍️ Genero la risposta finale..."
15. token: "###" (primi caratteri della risposta)
16. token: " Ver" (token successivi...)
17. token: "ifica"
    ... (tokens continuano ad arrivare)
18. complete: { response: {...}, cost: {...}, sources: [...] }
```

I **token** arrivano carattere per carattere in tempo reale, permettendo di mostrare la risposta mentre viene generata.

---

## Risoluzione Problemi

| Problema                        | Soluzione                                                           |
| ------------------------------- | ------------------------------------------------------------------- |
| Eventi arrivano tutti insieme   | Verifica buffering proxy, aggiungi `X-Accel-Buffering: no`          |
| Connessione si chiude           | Implementa reconnection con `EventSource`                           |
| Eventi duplicati                | Usa ID univoci per deduplicazione                                   |
| Timeout                         | Aumenta timeout del proxy/server                                    |
| Token non arrivano in real-time | Verifica che il server usi `flushHeaders()` e flush dopo ogni write |
