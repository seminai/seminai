# Dosage ReAct Agent - Frontend Integration Guide

## Overview

The Dosage ReAct Agent is an AI-powered agronomist assistant that helps users plan, validate, and execute phytosanitary treatments. It follows the **ReAct pattern** (Reason -> Act -> Observe) and communicates in real-time with the frontend via **Server-Sent Events (SSE)**.

### Key Features

- **23+ tools** for product matching, dosage calculation, compliance validation, stock management
- **Structured questionnaire**: agent presents interactive questions with predefined options before planning
- **Treatment Plan lifecycle**: draft -> review -> modify -> approve -> execute
- **Human-in-the-loop**: destructive operations require explicit user approval
- **Multi-provider LLM**: supports both Claude and OpenAI, model selected by task complexity
- **Real-time streaming**: token-by-token text delivery, tool call notifications, planning events
- **Cost tracking**: per-session token usage with provider breakdown

---

## API Endpoints

Base URL: `{API_BASE}/agent-chat`

| Method | Path               | Description                                 |
| ------ | ------------------ | ------------------------------------------- |
| `POST` | `/stream`          | Send a message and receive SSE stream       |
| `POST` | `/message`         | Send a message (non-streaming, synchronous) |
| `POST` | `/approve`         | Approve a pending destructive action        |
| `POST` | `/reject`          | Reject a pending action with reason         |
| `GET`  | `/state/:threadId` | Read current conversation state             |

All endpoints require **Bearer token authentication** (`Authorization: Bearer <token>`).

---

## 1. Streaming Chat (`POST /stream`)

This is the primary endpoint for real-time interaction.

### Request

```typescript
// Request body
interface StreamRequest {
  threadId: string; // Unique conversation ID (generate a UUID on first message)
  message: string; // User message text
  modelName?: string; // "gpt-4o" | "gpt-4o-mini" | "gpt-4-turbo" | "gpt-4" | "gpt-3.5-turbo"
  temperature?: number; // 0-1 (default: 0)
  jobId?: string; // Optional: link to an existing dosage job for RAG context
  workspaceId?: string; // Optional: workspace scope for rules search
}
```

### Response Format (SSE)

The response is a stream of `text/event-stream` events. Each event is a JSON object on a `data:` line:

```
data: {"type":"token","content":"Analizzo"}

data: {"type":"token","content":" i prodotti"}

data: {"type":"tool_call","toolCall":{"name":"search_products","args":{...},"id":"call_abc123"}}

data: {"type":"token","content":"Ho trovato 3 prodotti compatibili..."}

data: {"type":"complete","sources":[...],"cost":{...},"response":{...}}
```

---

## 2. Stream Event Types

### Core Events

| Event Type          | Description                     | Key Fields                     |
| ------------------- | ------------------------------- | ------------------------------ |
| `token`             | Text chunk from the agent       | `content: string`              |
| `tool_call`         | Agent is calling a tool         | `toolCall: { name, args, id }` |
| `tool_result`       | Result from a tool execution    | `content: string`              |
| `complete`          | Conversation turn finished      | `sources, cost, response`      |
| `error`             | Error occurred                  | `error: string`                |
| `requires_approval` | Agent needs user approval       | `toolCall: { name, args, id }` |
| `loop_warning`      | Too many consecutive tool calls | `content: string`              |

### Planning Events

| Event Type            | Description                            | Key Fields                                        |
| --------------------- | -------------------------------------- | ------------------------------------------------- |
| `plan_step_generated` | A treatment step was added to the plan | `plan: { planId, step, currentStep, totalSteps }` |
| `plan_presented`      | Complete plan ready for review         | `plan: { planId, totalSteps, status }`            |
| `plan_step_modified`  | A plan step was modified               | `plan: { planId, step }`                          |
| `plan_executing`      | Plan execution in progress             | `plan: { planId, currentStep, totalSteps }`       |
| `plan_step_executed`  | A plan step was executed               | `plan: { planId, step }`                          |

### Questionnaire Events

| Event Type                | Description                                     | Key Fields                     |
| ------------------------- | ----------------------------------------------- | ------------------------------ |
| `questionnaire_presented` | Agent presents structured questions to the user | `questionnaire: Questionnaire` |

### Metadata Events

| Event Type              | Description                  | Key Fields                                       |
| ----------------------- | ---------------------------- | ------------------------------------------------ |
| `model_selected`        | Model chosen for the task    | `modelInfo: { provider, modelName, complexity }` |
| `thinking`              | Agent reasoning (internal)   | `content: string`                                |
| `working_memory_update` | Data saved to working memory | `workingMemoryKey: string`                       |

---

## 3. Event TypeScript Interfaces

```typescript
type StreamEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'working_memory_update'
  | 'complete'
  | 'requires_approval'
  | 'loop_warning'
  | 'error'
  | 'plan_step_generated'
  | 'plan_presented'
  | 'plan_step_modified'
  | 'plan_executing'
  | 'plan_step_executed'
  | 'model_selected'
  | 'questionnaire_presented';

interface StreamEvent {
  type: StreamEventType;

  /** Text content (for token, thinking, loop_warning, error) */
  content?: string;

  /** Tool call info (for tool_call, requires_approval) */
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };

  /** Working memory key updated */
  workingMemoryKey?: string;

  /** Source citations (for complete) */
  sources?: SourceCitation[];

  /** Cost tracking (for complete) */
  cost?: {
    inputTokens: number;
    outputTokens: number;
    tavilyCalls: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
    provider?: string; // "openai" | "claude"
    modelName?: string; // e.g. "gpt-4o", "claude-sonnet-4-20250514"
    byProvider?: Record<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      }
    >;
  };

  /** Error message (for error) */
  error?: string;

  /** Final response (for complete) */
  response?: {
    status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';
    message?: string;
    sources?: SourceCitation[];
    error?: string;
    pendingToolCalls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
  };

  /** Planning data (for plan_* events) */
  plan?: {
    planId?: string;
    step?: PlanStep;
    totalSteps?: number;
    currentStep?: number;
    status?: string;
  };

  /** Model selection info (for model_selected) */
  modelInfo?: {
    provider: 'claude' | 'openai';
    modelName: string;
    complexity: 'low' | 'medium' | 'high';
  };

  /** Structured questionnaire (for questionnaire_presented) */
  questionnaire?: Questionnaire;
}

// ── Questionnaire Types ──

type QuestionType = 'single_select' | 'multi_select' | 'text';

interface QuestionOption {
  label: string; // e.g. "Vigneto Nord - 12.5 ha (Vite)"
  value: string; // e.g. production unit ID
  description?: string;
}

interface Question {
  id: string; // e.g. "target_units"
  question: string;
  type: QuestionType;
  options?: QuestionOption[]; // required for select types
  required: boolean;
  placeholder?: string; // for text type
}

interface Questionnaire {
  title: string;
  description?: string;
  questions: Question[];
}

interface SourceCitation {
  title: string;
  url: string;
  fragment?: string;
}
```

---

## 4. Frontend Implementation

### 4.1 SSE Connection

```typescript
async function streamAgentMessage(
  threadId: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agent-chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // Skip malformed events
        }
      }
    }
  }
}
```

### 4.2 React Hook Example

```typescript
import { useState, useCallback, useRef } from 'react';

type AgentStatus = 'idle' | 'streaming' | 'awaiting_approval' | 'awaiting_questionnaire' | 'error';

interface PendingApproval {
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolId: string;
}

interface CostInfo {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  provider?: string;
  modelName?: string;
}

interface ToolActivity {
  name: string;
  args: Record<string, unknown>;
  id?: string;
  timestamp: number;
}

export function useDosageAgent(threadId: string) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>(
    [],
  );
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [streamingContent, setStreamingContent] = useState('');
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [activeTools, setActiveTools] = useState<ToolActivity[]>([]);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [activeQuestionnaire, setActiveQuestionnaire] = useState<Questionnaire | null>(null);
  const [cost, setCost] = useState<CostInfo | null>(null);
  const [sources, setSources] = useState<SourceCitation[]>([]);

  const sendMessage = useCallback(
    async (message: string) => {
      // Add user message
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      setStatus('streaming');
      setStreamingContent('');
      setActiveTools([]);

      await streamAgentMessage(threadId, message, (event) => {
        switch (event.type) {
          // --- Text tokens (build the response incrementally) ---
          case 'token':
            setStreamingContent((prev) => prev + (event.content || ''));
            break;

          // --- Tool calls (show what the agent is doing) ---
          case 'tool_call':
            if (event.toolCall) {
              setActiveTools((prev) => [
                ...prev,
                {
                  name: event.toolCall!.name,
                  args: event.toolCall!.args,
                  id: event.toolCall!.id,
                  timestamp: Date.now(),
                },
              ]);
            }
            break;

          // --- Approval required (pause and ask user) ---
          case 'requires_approval':
            setStatus('awaiting_approval');
            setPendingApproval({
              toolName: event.toolCall!.name,
              toolArgs: event.toolCall!.args,
              toolId: event.toolCall!.id!,
            });
            break;

          // --- Planning events (track plan progress) ---
          case 'plan_step_generated':
            setActivePlan((prev) => ({
              ...prev,
              planId: event.plan?.planId,
              steps: [...(prev?.steps || []), event.plan?.step],
              totalSteps: event.plan?.totalSteps,
            }));
            break;

          case 'plan_presented':
            setActivePlan((prev) => ({
              ...prev,
              status: 'presented',
            }));
            break;

          case 'plan_step_modified':
            setActivePlan((prev) => {
              if (!prev) return prev;
              const updatedSteps = prev.steps.map((s: any) =>
                s.sequence === event.plan?.step?.sequence ? event.plan.step : s,
              );
              return { ...prev, steps: updatedSteps };
            });
            break;

          case 'plan_executing':
            setActivePlan((prev) => ({ ...prev, status: 'executing' }));
            break;

          case 'plan_step_executed':
            setActivePlan((prev) => {
              if (!prev) return prev;
              const updatedSteps = prev.steps.map((s: any) =>
                s.sequence === event.plan?.step?.sequence ? { ...s, status: 'executed' } : s,
              );
              return { ...prev, steps: updatedSteps };
            });
            break;

          // --- Questionnaire (structured questions for the user) ---
          case 'questionnaire_presented':
            if (event.questionnaire) {
              setActiveQuestionnaire(event.questionnaire);
              setStatus('awaiting_questionnaire');
            }
            break;

          // --- Model info ---
          case 'model_selected':
            // Optional: show which model is being used
            console.log(`Model: ${event.modelInfo?.provider}/${event.modelInfo?.modelName}`);
            break;

          // --- Loop warning ---
          case 'loop_warning':
            console.warn('Agent loop warning:', event.content);
            break;

          // --- Completion ---
          case 'complete':
            setStatus('idle');
            if (event.cost) setCost(event.cost);
            if (event.sources) setSources(event.sources);
            // Finalize the assistant message
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: event.response?.message || '' },
            ]);
            setStreamingContent('');
            break;

          // --- Error ---
          case 'error':
            setStatus('error');
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: `Errore: ${event.error}` },
            ]);
            setStreamingContent('');
            break;
        }
      });
    },
    [threadId],
  );

  const approve = useCallback(async () => {
    setStatus('streaming');
    setPendingApproval(null);

    const res = await fetch(`${API_BASE}/agent-chat/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ threadId }),
    });

    const data = await res.json();
    setStatus(data.data.status === 'REQUIRES_APPROVAL' ? 'awaiting_approval' : 'idle');
    setMessages((prev) => [...prev, { role: 'assistant', content: data.data.message || '' }]);

    if (data.data.pendingToolCalls?.length) {
      setPendingApproval({
        toolName: data.data.pendingToolCalls[0].name,
        toolArgs: data.data.pendingToolCalls[0].args,
        toolId: data.data.pendingToolCalls[0].id,
      });
    }
  }, [threadId]);

  const reject = useCallback(
    async (reason: string) => {
      setStatus('streaming');
      setPendingApproval(null);

      const res = await fetch(`${API_BASE}/agent-chat/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId, reason }),
      });

      const data = await res.json();
      setStatus('idle');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.data.message || '' }]);
    },
    [threadId],
  );

  // Submit questionnaire answers as a formatted message
  const submitQuestionnaire = useCallback(
    async (answers: Record<string, string | string[]>) => {
      setActiveQuestionnaire(null);

      // Format answers as a clear text message for the agent
      const lines = Object.entries(answers)
        .map(([questionId, answer]) => {
          const value = Array.isArray(answer) ? answer.join(', ') : answer;
          return `- ${questionId}: ${value}`;
        })
        .join('\n');

      const formattedMessage = `Risposte al questionario:\n${lines}`;
      await sendMessage(formattedMessage);
    },
    [sendMessage],
  );

  return {
    messages,
    status,
    streamingContent,
    pendingApproval,
    activeTools,
    activePlan,
    activeQuestionnaire,
    cost,
    sources,
    sendMessage,
    approve,
    reject,
    submitQuestionnaire,
  };
}
```

### 4.3 React Component Example

```tsx
function DosageChat() {
  const threadId = useRef(crypto.randomUUID()).current;
  const {
    messages,
    status,
    streamingContent,
    pendingApproval,
    activeTools,
    activePlan,
    activeQuestionnaire,
    cost,
    sources,
    sendMessage,
    approve,
    reject,
    submitQuestionnaire,
  } = useDosageAgent(threadId);

  return (
    <div className="dosage-chat">
      {/* Message History */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <Markdown>{msg.content}</Markdown>
          </div>
        ))}

        {/* Streaming response (in progress) */}
        {streamingContent && (
          <div className="message assistant streaming">
            <Markdown>{streamingContent}</Markdown>
          </div>
        )}
      </div>

      {/* Active Tool Calls (show what the agent is doing) */}
      {activeTools.length > 0 && status === 'streaming' && (
        <ToolActivityIndicator tools={activeTools} />
      )}

      {/* Structured Questionnaire */}
      {activeQuestionnaire && (
        <QuestionnaireCard questionnaire={activeQuestionnaire} onSubmit={submitQuestionnaire} />
      )}

      {/* Treatment Plan Preview */}
      {activePlan && (
        <TreatmentPlanTable
          plan={activePlan}
          onModifyStep={(seq, changes) =>
            sendMessage(`Modifica il passo ${seq}: ${JSON.stringify(changes)}`)
          }
        />
      )}

      {/* Approval Dialog */}
      {pendingApproval && (
        <ApprovalDialog
          toolName={pendingApproval.toolName}
          toolArgs={pendingApproval.toolArgs}
          onApprove={approve}
          onReject={(reason) => reject(reason)}
        />
      )}

      {/* Cost Info */}
      {cost && (
        <CostBadge
          inputTokens={cost.inputTokens}
          outputTokens={cost.outputTokens}
          totalCost={cost.totalCostUsd}
          provider={cost.provider}
          model={cost.modelName}
        />
      )}

      {/* Sources */}
      {sources.length > 0 && <SourcesList sources={sources} />}

      {/* Input */}
      <MessageInput
        disabled={status !== 'idle'}
        onSend={sendMessage}
        placeholder="Es: Pianifica i trattamenti per il vigneto contro la peronospora"
      />
    </div>
  );
}
```

---

## 5. Tool Activity Indicator

The agent calls tools during its reasoning process. Use `tool_call` events to show the user what the agent is doing in real-time.

### Recommended Tool Display Names

```typescript
const TOOL_DISPLAY_NAMES: Record<string, { label: string; icon: string }> = {
  // Context Discovery & Questionnaire
  list_user_companies: { label: 'Caricamento aziende', icon: 'building' },
  list_production_units: { label: 'Caricamento unita produttive', icon: 'map' },
  list_company_products: { label: 'Caricamento prodotti magazzino', icon: 'package' },
  ask_user_questions: { label: 'Preparazione domande', icon: 'help-circle' },

  // Computation
  check_product_revoked: { label: 'Verifica stato prodotto', icon: 'shield-check' },
  expand_production_cycles: { label: 'Caricamento cicli produttivi', icon: 'calendar' },
  extract_buffer_zones: { label: 'Calcolo fasce di rispetto', icon: 'ruler' },
  search_products: { label: 'Ricerca prodotti compatibili', icon: 'search' },
  enrich_from_bdf: { label: 'Arricchimento dati BDF', icon: 'database' },
  plan_treatment_strategy: { label: 'Pianificazione strategia', icon: 'strategy' },
  calculate_dosage: { label: 'Calcolo dosi e date', icon: 'calculator' },
  validate_compliance: { label: 'Verifica conformita', icon: 'clipboard-check' },
  validate_sa_group_limits: { label: 'Verifica limiti gruppi SA', icon: 'alert-triangle' },
  check_compatibility: { label: 'Verifica compatibilita', icon: 'git-merge' },
  calculate_stock_balance: { label: 'Bilancio magazzino', icon: 'warehouse' },
  optimize_dosage: { label: 'Ottimizzazione dosi', icon: 'trending-up' },

  // Planning
  generate_treatment_plan: { label: 'Generazione piano trattamenti', icon: 'file-text' },
  modify_plan_step: { label: 'Modifica passo del piano', icon: 'edit' },
  execute_treatment_plan: { label: 'Esecuzione piano', icon: 'play' },

  // Destructive
  create_treatment_jobs: { label: 'Creazione job trattamenti', icon: 'save' },

  // Search
  search_rules: { label: 'Ricerca disciplinari', icon: 'book-open' },
  search_disciplinari_database: { label: 'Ricerca database disciplinari', icon: 'database' },
  search_disciplinari_bdf_pdf: { label: 'Ricerca PDF disciplinari', icon: 'file-search' },
  bdf_search_product_doses: { label: 'Ricerca dosi BDF', icon: 'pill' },
  bdf_search_products_by_adversity: { label: 'Ricerca prodotti per avversita', icon: 'bug' },
  tavily_scientific_search: { label: 'Ricerca fonti scientifiche', icon: 'globe' },
};
```

### Component Example

```tsx
function ToolActivityIndicator({ tools }: { tools: ToolActivity[] }) {
  const latestTool = tools[tools.length - 1];
  const info = TOOL_DISPLAY_NAMES[latestTool.name] || {
    label: latestTool.name,
    icon: 'cog',
  };

  return (
    <div className="tool-activity">
      <Spinner />
      <Icon name={info.icon} />
      <span>{info.label}...</span>
      <span className="tool-count">({tools.length} strumenti usati)</span>
    </div>
  );
}
```

---

## 6. Approval Flow (Human-in-the-Loop)

Certain operations are **destructive** and require explicit user approval before execution:

- `create_treatment_jobs` - Creates treatment jobs in the database
- `execute_treatment_plan` - Executes an approved plan (creates jobs)

### Flow Diagram

```
User sends message
       |
       v
  Agent reasons & calls tools
       |
       v
  Agent wants to call a destructive tool
       |
       v
  Stream emits: { type: "requires_approval", toolCall: { name, args, id } }
       |
       v
  Frontend shows ApprovalDialog
       |
    /     \
   v       v
APPROVE   REJECT
   |       |
   v       v
POST      POST
/approve  /reject
   |       |
   v       v
Agent     Agent proposes
executes  alternative
the tool  approach
```

### Approval Dialog Component

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

```typescript
// Inside submitQuestionnaire callback:
const formattedMessage = `Risposte al questionario:
- Unita produttive: Vigneto Nord (12.5 ha), Frutteto A (8.0 ha)
- Tempistica: Prossime 2 settimane
- Obiettivo: Svuotare il magazzino completamente
- Note: Preferisco iniziare col Sercadis`;

await sendMessage(formattedMessage); // Uses existing POST /stream
```

The agent receives this as a normal `HumanMessage` and proceeds autonomously with the full planning workflow.

---

## 8. Treatment Plan UI

When the agent generates a treatment plan, it emits planning events that you can use to build a rich plan preview.

### Plan Data Structure

```typescript
interface TreatmentPlan {
  id: string;
  status: 'draft' | 'presented' | 'approved' | 'modified' | 'executing' | 'completed' | 'rejected';
  steps: PlanStep[];
  compliance: {
    overallStatus: 'conforme' | 'non_conforme' | 'da_verificare';
    conformSteps: number;
    totalSteps: number;
    warnings: string[];
  };
  stockSummary: {
    hasIssues: boolean;
    products: Array<{
      name: string;
      required: number;
      available: number;
      deficit: number;
      unit: string;
    }>;
  };
}

interface PlanStep {
  id: string;
  sequence: number; // 1-based
  status: 'pending' | 'approved' | 'modified' | 'rejected' | 'executed';
  treatment: {
    productName: string;
    activeIngredient: string;
    adversity: string;
    dosePerHa: number;
    doseUnit: string;
    totalQuantity: number;
    applicationDate: string;
    safetyInterval?: number;
  };
  compliance: {
    status: 'conforme' | 'non_conforme' | 'da_verificare';
    violations: Array<{ message: string; severity: 'ERROR' | 'WARNING' | 'INFO' }>;
  };
  alternatives?: Array<{ productName: string; reason: string; dosePerHa: number }>;
}
```

### Plan Table Component

```tsx
function TreatmentPlanTable({
  plan,
  onModifyStep,
}: {
  plan: TreatmentPlan;
  onModifyStep: (sequence: number, changes: string) => void;
}) {
  const complianceIcon = (status: string) => {
    switch (status) {
      case 'conforme':
        return '✅';
      case 'non_conforme':
        return '❌';
      case 'da_verificare':
        return '⚠️';
      default:
        return '❓';
    }
  };

  const stepStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'gray',
      approved: 'green',
      modified: 'yellow',
      rejected: 'red',
      executed: 'blue',
    };
    return <span className={`badge badge-${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="treatment-plan">
      <div className="plan-header">
        <h3>Piano di Trattamento</h3>
        <span className={`plan-status plan-status-${plan.status}`}>
          {plan.status.toUpperCase()}
        </span>
      </div>

      {/* Compliance Summary */}
      <div className="compliance-summary">
        {complianceIcon(plan.compliance.overallStatus)}
        <span>
          {plan.compliance.conformSteps}/{plan.compliance.totalSteps} passi conformi
        </span>
        {plan.compliance.warnings.map((w, i) => (
          <div key={i} className="compliance-warning">
            ⚠️ {w}
          </div>
        ))}
      </div>

      {/* Plan Table */}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Data</th>
            <th>Prodotto</th>
            <th>P.A.</th>
            <th>Dose/ha</th>
            <th>Avversita</th>
            <th>Conformita</th>
            <th>Stato</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {plan.steps.map((step) => (
            <tr key={step.id} className={`step-row step-${step.status}`}>
              <td>{step.sequence}</td>
              <td>{new Date(step.treatment.applicationDate).toLocaleDateString('it-IT')}</td>
              <td>{step.treatment.productName}</td>
              <td>{step.treatment.activeIngredient}</td>
              <td>
                {step.treatment.dosePerHa} {step.treatment.doseUnit}
              </td>
              <td>{step.treatment.adversity}</td>
              <td>
                {complianceIcon(step.compliance.status)}
                {step.compliance.violations.length > 0 && (
                  <Tooltip content={step.compliance.violations.map((v) => v.message).join('\n')}>
                    <span className="violation-count">({step.compliance.violations.length})</span>
                  </Tooltip>
                )}
              </td>
              <td>{stepStatusBadge(step.status)}</td>
              <td>
                {step.status !== 'executed' && step.status !== 'rejected' && (
                  <button
                    onClick={() => {
                      const changes = prompt('Cosa vuoi modificare? (es: dose 1.5 kg/ha)');
                      if (changes) onModifyStep(step.sequence, changes);
                    }}
                  >
                    Modifica
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Stock Summary */}
      {plan.stockSummary.hasIssues && (
        <div className="stock-warning">
          <h4>⚠️ Problemi di Stock</h4>
          {plan.stockSummary.products
            .filter((p) => p.deficit > 0)
            .map((p, i) => (
              <div key={i} className="stock-issue">
                <strong>{p.name}</strong>: necessari {p.required} {p.unit}, disponibili{' '}
                {p.available} {p.unit}
                (deficit: {p.deficit} {p.unit})
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
```

---

## 9. Typical User Flows

### Flow 1: Simple Question

```
User: "Il Captano e' revocato?"
  --> token events (streaming response)
  --> tool_call: check_product_revoked
  --> token events (agent explains result)
  --> complete event
```

**Frontend**: show streaming text + tool activity indicator.

### Flow 2: Treatment Planning (Full Workflow)

```
User: "Pianifica i trattamenti per il vigneto contro la peronospora"

Step 1 - Context Discovery:
  --> tool_call: list_user_companies
  --> tool_call: list_production_units
  --> tool_call: list_company_products
  --> token: "Ho trovato la tua azienda con 3 vigneti..."

Step 2 - Analysis:
  --> tool_call: search_products
  --> tool_call: calculate_dosage
  --> tool_call: validate_compliance
  --> tool_call: calculate_stock_balance

Step 3 - Plan Generation:
  --> tool_call: generate_treatment_plan
  --> plan_step_generated (x N steps)
  --> plan_presented
  --> token: "Ecco il piano proposto..."
  --> complete

Step 4 - User modifies:
User: "Cambia il passo 2 a 1.5 kg/ha"
  --> tool_call: modify_plan_step
  --> plan_step_modified
  --> token: "Ho modificato il passo 2..."
  --> complete

Step 5 - User approves:
User: "Approva ed esegui il piano"
  --> tool_call: execute_treatment_plan
  --> requires_approval (STREAM PAUSES)
  --> Frontend shows ApprovalDialog
  --> User clicks "Approva"
  --> POST /approve
  --> plan_executing
  --> plan_step_executed (x N)
  --> token: "Piano eseguito: creati 5 job..."
  --> complete (with cost info)
```

### Flow 3: Quick Compliance Check

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
