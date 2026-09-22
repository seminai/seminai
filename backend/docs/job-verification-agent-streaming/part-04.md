# Job Verification Agent - Live Streaming Guide — Part 4

[Back to the guide index](../JOB_VERIFICATION_AGENT_STREAMING.md)

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
