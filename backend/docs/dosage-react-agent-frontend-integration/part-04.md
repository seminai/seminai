# Dosage ReAct Agent — Frontend Integration Guide — Part 4

[Back to the guide index](../dosage-react-agent-frontend-integration.md)

```tsx
function DosageAgentChat() {
  const {
    messages,
    isStreaming,
    pendingApproval,
    sendMessage,
    approve,
    reject,
    stop,
    newConversation,
  } = useAgentChat({
    baseUrl: 'http://localhost:8081',
    token: authToken,
    modelName: 'gpt-4o-mini',
    jobId: currentJobId, // opzionale
    workspaceId: currentWsId, // opzionale
  });

  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div>
      <button onClick={newConversation}>Nuova conversazione</button>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {/* Tool calls indicator */}
            {msg.toolCalls?.map((tc, i) => (
              <div key={i} className="tool-badge">
                🔧 {tc.name}
              </div>
            ))}

            {/* Message content (Markdown) */}
            <ReactMarkdown>{msg.content}</ReactMarkdown>

            {/* Streaming indicator */}
            {msg.status === 'streaming' && <span className="cursor">▌</span>}
          </div>
        ))}
      </div>

      {/* Approval dialog */}
      {pendingApproval && (
        <div className="approval-dialog">
          <p>
            L'agente vuole eseguire: <b>{pendingApproval.toolCall?.name}</b>
          </p>
          <pre>{JSON.stringify(pendingApproval.toolCall?.args, null, 2)}</pre>
          <button onClick={approve}>Approva</button>
          <button onClick={() => reject('Non voglio eseguire questa azione')}>Rifiuta</button>
        </div>
      )}

      {/* Input */}
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Chiedi all'agronomo AI..."
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={handleSend}>Invia</button>
        )}
      </div>
    </div>
  );
}
```

---

## Flusso completo: Esempio reale

### Scenario: Verifica conformità + Creazione job

```
Utente: "Pianifica i trattamenti per Captano su Melo (2 ha) e crea i job"

[1] → POST /agent-chat/stream
      {threadId: "t-001", message: "Pianifica i trattamenti per Captano..."}

[2] ← SSE: {type: "tool_call", toolCall: {name: "check_product_revoked", args: {productName: "Captano"}}}
[3] ← SSE: {type: "tool_call", toolCall: {name: "search_products", args: {products: [...], unitOfProduction: [...]}}}
[4] ← SSE: {type: "tool_call", toolCall: {name: "calculate_dosage", args: {strategy: "avg"}}}
[5] ← SSE: {type: "tool_call", toolCall: {name: "validate_compliance", args: {}}}
[6] ← SSE: {type: "token", content: "Ho verificato il Captano..."}
[7] ← SSE: {type: "token", content: " Dose conforme al disciplinare EMR..."}

    --- L'agente decide di creare i job ---

[8] ← SSE: {type: "requires_approval", toolCall: {name: "create_treatment_jobs", args: {persist: true}}}

    --- Frontend mostra dialog di approvazione ---

[9] → POST /agent-chat/approve {threadId: "t-001"}

[10] ← JSON: {status: "success", data: {status: "COMPLETED", message: "Creati 4 trattamenti..."}}
```

---

## Tool disponibili nell'agente

L'agente ha accesso a 19 tool. Il frontend non li chiama direttamente — l'LLM decide quali usare.
Utile mostrarli nella UI quando appaiono come `tool_call` events:

| Tool Name                          | Icona | Descrizione UI                          |
| ---------------------------------- | ----- | --------------------------------------- |
| `check_product_revoked`            | 🔍    | Verifica revoca prodotto                |
| `search_products`                  | 📦    | Ricerca prodotti per coltura            |
| `calculate_dosage`                 | 📊    | Calcolo dosi e date trattamento         |
| `validate_compliance`              | ✅    | Validazione disciplinare                |
| `validate_sa_group_limits`         | ⚠️    | Limiti gruppi sostanze attive           |
| `check_compatibility`              | 🧪    | Compatibilità principi attivi           |
| `calculate_stock_balance`          | 📋    | Bilancio scorte magazzino               |
| `optimize_dosage`                  | ⚙️    | Ottimizzazione dosi                     |
| `plan_treatment_strategy`          | 🎯    | Strategia trattamento                   |
| `expand_production_cycles`         | 🌱    | Espansione cicli produttivi             |
| `extract_buffer_zones`             | 🏞️    | Zone cuscinetto                         |
| `enrich_from_bdf`                  | 🏛️    | Arricchimento da Banca Dati Fitofarmaci |
| `create_treatment_jobs`            | 💾    | Creazione job (richiede approvazione)   |
| `search_disciplinari_database`     | 📖    | Ricerca disciplinari regionali          |
| `search_disciplinari_bdf_pdf`      | 📄    | Ricerca PDF disciplinari BDF            |
| `tavily_scientific_search`         | 🌐    | Ricerca scientifica web                 |
| `bdf_search_product_doses`         | 💊    | Dosi da BDF ufficiale                   |
| `bdf_search_products_by_adversity` | 🐛    | Prodotti per avversità                  |
| `search_rules`                     | 📜    | Regole aziendali                        |

---

## Note importanti

1. **threadId** — Deve essere lo stesso per tutta la conversazione. Generare con `uuid()` all'inizio e riusare per approve/reject.

2. **SSE parsing** — Le righe SSE hanno formato `data: {json}\n\n`. Splittare per `\n`, filtrare quelle che iniziano con `data: `.

3. **Approval gate** — Solo `create_treatment_jobs` richiede approvazione. Gli altri tool vengono eseguiti automaticamente.

4. **Errori** — Se arriva `{type: "error"}`, la conversazione è terminata. Mostrare messaggio e permettere retry.

5. **Costi** — L'evento `complete` include i costi in USD. Utile per mostrare al utente il consumo crediti.

6. **Chiusura stream** — Usare `AbortController` per interrompere lo stream lato client.
