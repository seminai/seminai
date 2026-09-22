# Job Verification Agent API — Part 4

[Back to the guide index](../JOB_VERIFICATION_AGENT_API.md)

```tsx
function JobVerificationChat({ jobs }: { jobs: JobWithAssignmentDTO[] }) {
  const threadId = useMemo(() => crypto.randomUUID(), []);
  const {
    messages,
    isLoading,
    pendingAction,
    currentSources,
    sendMessage,
    approveAction,
    rejectAction,
  } = useJobVerificationAgent(threadId, jobs);

  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              msg.role === 'user' ? 'bg-blue-100 ml-8' : 'bg-gray-100 mr-8'
            }`}
          >
            <p>{msg.content}</p>

            {/* Sources */}
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-sm font-medium">Fonti:</p>
                <ul className="text-sm">
                  {msg.sources.map((source, j) => (
                    <li key={j}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {source.title}
                      </a>
                      <span className="text-gray-500"> - {source.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="animate-spin">...</span>
            L'agente sta elaborando...
          </div>
        )}
      </div>

      {/* Pending Action Approval */}
      {pendingAction && (
        <div className="p-4 bg-yellow-50 border-t">
          <p className="font-medium">Azione in attesa di approvazione:</p>
          <p className="text-sm text-gray-600">{pendingAction.description}</p>

          {pendingAction.type === 'job_modification' && (
            <p className="text-sm text-orange-600 mt-1">
              Attenzione: questa modifica imposterà conformityChecked=false
            </p>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                if (pendingAction.type === 'job_modification' && pendingAction.args) {
                  approveAction({
                    jobId: pendingAction.args.jobId as string,
                    field: pendingAction.args.field as string,
                    newValue: pendingAction.args.newValue,
                  });
                } else {
                  approveAction();
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Approva
            </button>
            <button
              onClick={() => {
                const reason = prompt('Motivo del rifiuto:');
                if (reason) rejectAction(reason);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Rifiuta
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Fai una domanda sui job..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={isLoading || !!pendingAction}
          />
          <button
            type="submit"
            disabled={isLoading || !!pendingAction || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            Invia
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## Gestione Modifiche Job

Quando l'utente chiede di modificare un job:

1. L'agente chiama `propose_job_modification` tool
2. L'API restituisce `requires_modification_approval` event
3. Il frontend mostra UI di approvazione
4. L'utente approva o rifiuta

**Se approvato:**

- La modifica viene applicata al job nel database
- `conformityChecked` viene impostato a `false`
- La history del job viene aggiornata con i dettagli della modifica

**Campi modificabili:**

- `quantity` - Quantità prodotto
- `unitOfMeasureQuantity` - Unità di misura
- `avversity` - Avversità target
- `note` - Note aggiuntive
- `modeOfApplication` - Modalità applicazione
- `treatedSurface` - Superficie trattata
- Altri campi del job...

---

## Fonti e Citazioni

L'agente include sempre le fonti quando usa informazioni esterne:

```typescript
interface SourceCitation {
  url: string; // URL della fonte
  title: string; // Titolo del documento
  description: string; // Breve descrizione/estratto
}
```

**Tipi di fonti:**

- **Etichette**: PDF ufficiali dal SIAN
- **Disciplinari**: Dataset BDF regionali
- **Web**: Risultati Tavily search
- **Documenti indicizzati**: Ricerca semantica Qdrant

---

## Tool Disponibili

| Tool                       | Descrizione                                        |
| -------------------------- | -------------------------------------------------- |
| `tavily_search`            | Ricerca web generale                               |
| `extract_label_data`       | Estrae dati strutturati da etichette fitosanitarie |
| `search_disciplinari`      | Cerca nei disciplinari regionali BDF               |
| `vector_search_documents`  | Ricerca semantica su documenti indicizzati         |
| `get_job_details`          | Ottiene dettagli completi di un job                |
| `propose_job_modification` | Propone una modifica a un job                      |

---

## Error Handling

```typescript
// Evento errore nello stream
{
  "type": "error",
  "error": "Descrizione dell'errore"
}

// Risposta errore non-streaming
{
  "status": "error",
  "message": "Descrizione dell'errore",
  "code": "ERROR_CODE"
}
```

**Codici errore comuni:**

- `USER_NOT_AUTHENTICATED` - Token mancante/invalido
- `INVALID_MESSAGE` - Messaggio vuoto o non valido
- `INVALID_THREAD_ID` - Thread ID mancante
- `INVALID_JOBS` - Array jobs vuoto o non valido
- `AGENT_ERROR` - Errore interno dell'agente
