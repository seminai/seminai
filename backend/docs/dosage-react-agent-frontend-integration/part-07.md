# Dosage ReAct Agent - Frontend Integration Guide — Part 7

[Back to the guide index](../DOSAGE_REACT_AGENT_FRONTEND_INTEGRATION.md)

```
User: "Quanti trattamenti SDHI posso fare sulla vite in Emilia-Romagna?"
  --> tool_call: search_rules
  --> tool_call: validate_sa_group_limits
  --> token: "Secondo il disciplinare..."
  --> complete (with sources)
```

### Flow 4: Structured Questionnaire (Interactive Planning)

```
User: "Crea un piano di distribuzione del leopard e sercadis"

Step 1 - Context Discovery:
  --> tool_call: list_production_units
  --> tool_call: list_company_products
  --> (agent discovers 3 units, stock levels, etc.)

Step 2 - Questionnaire:
  --> tool_call: ask_user_questions
  --> questionnaire_presented event (SSE)
  --> token: "Ho preparato alcune domande per procedere..."
  --> complete

  Frontend: renders QuestionnaireCard with selectable options
  User: selects options + clicks "Invia risposte"

Step 3 - Answers (sent as normal message via POST /stream):
  "Risposte al questionario:
   - Unita produttive: Vigneto Nord (12.5 ha), Frutteto A (8.0 ha)
   - Tempistica: Prossime 2 settimane
   - Obiettivo: Svuotare il magazzino completamente"

Step 4 - Autonomous Plan Generation:
  --> tool_call: search_products
  --> tool_call: calculate_dosage
  --> tool_call: validate_compliance
  --> tool_call: generate_treatment_plan
  --> plan_step_generated (x N)
  --> plan_presented
  --> token: "Ecco il piano completo basato sulle tue risposte..."
  --> complete
```

**Frontend**: show tool activity -> questionnaire card -> after answers, show plan table.

---

## 10. Cost Display

The `complete` event includes detailed cost information:

```tsx
function CostBadge({ cost }: { cost: CostInfo }) {
  return (
    <div className="cost-badge">
      <span className="cost-amount">${cost.totalCostUsd.toFixed(4)} USD</span>
      <Tooltip
        content={
          `Input: ${cost.inputTokens} tokens\n` +
          `Output: ${cost.outputTokens} tokens\n` +
          `Provider: ${cost.provider || 'openai'}\n` +
          `Model: ${cost.modelName || 'gpt-4o'}`
        }
      >
        <InfoIcon size={14} />
      </Tooltip>
    </div>
  );
}
```

---

## 11. Thread Management

### Creating a New Thread

Generate a UUID on the client before the first message:

```typescript
const threadId = crypto.randomUUID();
```

This `threadId` is used for:

- All messages in the same conversation
- State management (approval/rejection)
- Working memory (tools share data within the same thread)

### Reading Thread State

```typescript
const response = await fetch(`${API_BASE}/agent-chat/state/${threadId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { data } = await response.json();
// data.messages: full conversation history
```

---

## 12. Error Handling

```typescript
function handleAgentError(event: StreamEvent) {
  if (event.type === 'error') {
    const errorMessage = event.error || 'Errore sconosciuto';

    // Common error patterns
    if (errorMessage.includes('OPENAI_API_KEY')) {
      showNotification('Configurazione server incompleta. Contattare il supporto.');
    } else if (errorMessage.includes('rate limit')) {
      showNotification('Troppe richieste. Riprovare tra qualche secondo.');
    } else if (errorMessage.includes('workspace')) {
      showNotification('Accesso al workspace non autorizzato.');
    } else {
      showNotification(`Errore: ${errorMessage}`);
    }
  }
}
```

---

## 13. Best Practices

1. **Thread persistence**: Save the `threadId` in localStorage or URL params so users can resume conversations.

2. **Show tool activity**: Always show what tool the agent is calling. Users should never see a blank loading state - they should see "Verifica conformita disciplinari..." etc.

3. **Approval context**: When showing the approval dialog, include a summary of what will be created (number of jobs, products, dates).

4. **Plan modifications**: Let users click on individual plan rows to modify them. Send natural language messages like "Cambia il passo 3: dose 2 kg/ha, data 15 maggio".

5. **Graceful degradation**: If the SSE connection drops, use `POST /message` as a fallback (non-streaming).

6. **Cost transparency**: Show the cost badge after each interaction so users are aware of credit consumption.

7. **Source citations**: When the agent uses scientific sources, display them as clickable links for transparency.

8. **Token streaming**: Render tokens as they arrive using a markdown renderer that handles incomplete markdown gracefully.

9. **Mobile considerations**: The plan table should be responsive. Consider a card layout on mobile instead of a table.

10. **Reconnection**: If the user refreshes the page, call `GET /state/:threadId` to restore the conversation and check if there's a pending approval.

11. **Questionnaire UX**: When showing the questionnaire, display options as clickable cards (not dropdowns). Always include an "Altro" free-text input for each select question so users can provide custom answers. Disable the "Invia" button until all required questions are answered.
