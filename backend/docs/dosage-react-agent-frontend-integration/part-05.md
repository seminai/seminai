# Dosage ReAct Agent - Frontend Integration Guide — Part 5

[Back to the guide index](../DOSAGE_REACT_AGENT_FRONTEND_INTEGRATION.md)

```tsx
function ApprovalDialog({
  toolName,
  toolArgs,
  onApprove,
  onReject,
}: {
  toolName: string;
  toolArgs: Record<string, unknown>;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  const getDescription = () => {
    switch (toolName) {
      case 'create_treatment_jobs':
        return "L'agente vuole creare i job di trattamento nel database.";
      case 'execute_treatment_plan':
        const stepCount = (toolArgs.stepSequences as number[])?.length || 'tutti i';
        return `L'agente vuole eseguire ${stepCount} passi del piano, creando i job nel database.`;
      default:
        return `L'agente vuole eseguire: ${toolName}`;
    }
  };

  return (
    <div className="approval-dialog">
      <div className="approval-header">
        <WarningIcon />
        <h3>Approvazione richiesta</h3>
      </div>

      <p>{getDescription()}</p>

      {/* Show tool arguments as summary */}
      <details>
        <summary>Dettagli operazione</summary>
        <pre>{JSON.stringify(toolArgs, null, 2)}</pre>
      </details>

      <div className="approval-actions">
        <button className="btn-approve" onClick={onApprove}>
          Approva
        </button>
        <div className="reject-section">
          <input
            placeholder="Motivo del rifiuto..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="btn-reject"
            onClick={() => onReject(reason || "Rifiutato dall'utente")}
          >
            Rifiuta
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 7. Structured Questionnaire UI

When the agent needs more information before planning (e.g., which production units, timing, priorities), it presents a **structured questionnaire** with predefined options based on real data. This replaces generic free-text questions with a clean, interactive UI.

### When it Triggers

The agent calls `ask_user_questions` after discovering the user's context via `list_production_units` and `list_company_products`. The streaming layer emits a `questionnaire_presented` SSE event with the full questionnaire structure.

### Questionnaire Event Example

```json
{
  "type": "questionnaire_presented",
  "questionnaire": {
    "title": "Informazioni per il piano di distribuzione",
    "description": "Ho trovato 3 unita produttive e i prodotti Leopard e Sercadis nel magazzino.",
    "questions": [
      {
        "id": "target_units",
        "question": "Su quali unita produttive vuoi distribuire?",
        "type": "multi_select",
        "options": [
          { "label": "Vigneto Nord - 12.5 ha (Vite)", "value": "pu-abc1" },
          { "label": "Frutteto A - 8.0 ha (Melo)", "value": "pu-abc2" },
          { "label": "Oliveto Sud - 3.2 ha (Olivo)", "value": "pu-abc3" }
        ],
        "required": true
      },
      {
        "id": "timing",
        "question": "Quando vuoi effettuare i trattamenti?",
        "type": "single_select",
        "options": [
          { "label": "Prossime 2 settimane", "value": "2w" },
          { "label": "Prossimo mese", "value": "1m" },
          { "label": "Stagione completa", "value": "season" }
        ],
        "required": true
      },
      {
        "id": "priority",
        "question": "Qual e' l'obiettivo principale?",
        "type": "single_select",
        "options": [
          { "label": "Svuotare il magazzino completamente", "value": "empty_stock" },
          { "label": "Trattamento preventivo standard", "value": "preventive" },
          { "label": "Trattamento curativo urgente", "value": "curative" }
        ],
        "required": true
      },
      {
        "id": "notes",
        "question": "Note o preferenze aggiuntive?",
        "type": "text",
        "required": false,
        "placeholder": "Es. preferisco iniziare col Sercadis..."
      }
    ]
  }
}
```

### QuestionnaireCard Component

```tsx
function QuestionnaireCard({
  questionnaire,
  onSubmit,
}: {
  questionnaire: Questionnaire;
  onSubmit: (answers: Record<string, string | string[]>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const handleSingleSelect = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleMultiSelect = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [questionId]: updated };
    });
  };

  const handleTextInput = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleOtherText = (questionId: string, value: string) => {
    setOtherText((prev) => ({ ...prev, [questionId]: value }));
    // Replace the answer with "Altro: <text>"
    setAnswers((prev) => ({ ...prev, [questionId]: `Altro: ${value}` }));
  };

  const isComplete = questionnaire.questions
    .filter((q) => q.required)
    .every((q) => {
      const answer = answers[q.id];
      return answer && (Array.isArray(answer) ? answer.length > 0 : answer.length > 0);
    });

  return (
    <div className="questionnaire-card">
      <div className="questionnaire-header">
        <HelpCircleIcon />
        <h3>{questionnaire.title}</h3>
      </div>
      {questionnaire.description && <p className="description">{questionnaire.description}</p>}

      {questionnaire.questions.map((q) => (
        <div key={q.id} className="question-block">
          <label>
            {q.question} {q.required && <span className="required">*</span>}
          </label>

          {/* Single Select: radio buttons as clickable cards */}
          {q.type === 'single_select' && q.options && (
            <div className="options-grid">
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  className={`option-card ${answers[q.id] === opt.value ? 'selected' : ''}`}
                  onClick={() => handleSingleSelect(q.id, opt.value)}
                >
                  <span className="option-label">{opt.label}</span>
                  {opt.description && <span className="option-desc">{opt.description}</span>}
                </button>
              ))}
              {/* "Altro" free text option */}
              <div className="option-other">
                <input
                  placeholder="Altro..."
                  value={otherText[q.id] || ''}
                  onChange={(e) => handleOtherText(q.id, e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Multi Select: checkboxes as clickable cards */}
          {q.type === 'multi_select' && q.options && (
            <div className="options-grid">
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  className={`option-card ${
                    ((answers[q.id] as string[]) || []).includes(opt.value) ? 'selected' : ''
                  }`}
                  onClick={() => handleMultiSelect(q.id, opt.value)}
                >
                  <CheckIcon checked={((answers[q.id] as string[]) || []).includes(opt.value)} />
                  <span className="option-label">{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Text: textarea */}
          {q.type === 'text' && (
            <textarea
              placeholder={q.placeholder || 'Scrivi qui...'}
              value={(answers[q.id] as string) || ''}
              onChange={(e) => handleTextInput(q.id, e.target.value)}
            />
          )}
        </div>
      ))}

      <button className="btn-submit" disabled={!isComplete} onClick={() => onSubmit(answers)}>
        Invia risposte
      </button>
    </div>
  );
}
```

### Answer Flow

When the user submits the questionnaire, the frontend formats answers as a text message and sends it via the existing `POST /stream` endpoint. No new endpoint is needed.
