# Dosage ReAct Agent - iOS Integration Guide

## Overview

This document explains how to integrate the APIs backed by `src/infrastructure/services/agents/dosage_agent_react/` from an iOS app.

Base URL:

```text
http://localhost:8081
```

Agent endpoints:

- `POST /agent-chat/stream`
- `POST /agent-chat/message`
- `POST /agent-chat/approve`
- `POST /agent-chat/reject`
- `GET /agent-chat/state/:threadId`

For iOS, authenticate with `Authorization: Bearer <jwt>`.

## Login

```bash
curl -X POST "http://localhost:8081/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ios@example.com","password":"your-password"}'
```

Response:

```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_123",
      "email": "ios@example.com",
      "name": "Francesco",
      "role": "USER",
      "credits": 124.56
    }
  }
}
```

Store `data.token` in Keychain.

## Conversation Rules

- Generate a UUID on the first message.
- Reuse the same `threadId` for the full conversation.
- Reuse the same `threadId` for `/approve`, `/reject`, and `/state/:threadId`.
- Send questionnaire answers as a normal follow-up message on the same thread.

Common body fields: `threadId`, `message`, optional `modelName`, `temperature`, `jobId`, `workspaceId`.
Allowed `modelName`: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo`.

## Live Streaming

`POST /agent-chat/stream` returns `text/event-stream`.

```bash
curl -N -X POST "http://localhost:8081/agent-chat/stream" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "threadId": "3F95F58E-D7F0-4C03-BB51-6B0A44C216AA",
    "message": "Check whether Captano is revoked and suggest alternatives",
    "modelName": "gpt-4o",
    "temperature": 0
  }'
```

### Streaming behaviour

The backend uses LangGraph's dual `streamMode: ["messages", "updates"]`:

- **messages mode** delivers true token-by-token LLM text fragments (`token` events).
- **updates mode** delivers node-level events: tool calls, loop warnings, and state transitions.

The client must concatenate all `token` events to build the full response. The final `complete` event includes the authoritative full message in `response.message`.

### Runtime limits

| Limit                     | Value           | Effect                  |
| ------------------------- | --------------- | ----------------------- |
| `STREAM_TIMEOUT_MS`       | 300 000 (5 min) | Aborts the stream       |
| `MAX_TOKENS_PER_MESSAGE`  | 200 000         | Emits `error` and stops |
| `LOOP_WARNING_THRESHOLD`  | 8 tool calls    | Emits `loop_warning`    |
| `LOOP_CRITICAL_THRESHOLD` | 15 tool calls   | Aborts agent loop       |
| `RECURSION_LIMIT`         | 50 graph steps  | LangGraph hard stop     |

### Example SSE output

```text
data: {"type":"token","content":"I am"}
data: {"type":"token","content":" checking"}
data: {"type":"token","content":" the product"}
data: {"type":"token","content":" status"}

data: {"type":"tool_call","toolCall":{"name":"check_product_revoked","args":{"registrationNumber":"12345"},"id":"call_1"}}

data: {"type":"token","content":"Cap"}
data: {"type":"token","content":"tano appears"}
data: {"type":"token","content":" revoked in the"}
data: {"type":"token","content":" current data."}

data: {"type":"complete","sources":[{"title":"Product label database","url":"https://example.com/source","fragment":"Captano revocato dal..."}],"cost":{"inputTokens":920,"outputTokens":210,"tavilyCalls":0,"totalCostUsd":0.0061,"costWithMarginUsd":0.00732,"provider":"openai","modelName":"gpt-4o"},"response":{"status":"COMPLETED","message":"Captano appears revoked in the current data. I can suggest alternatives if you want.","sources":[{"title":"Product label database","url":"https://example.com/source","fragment":"Captano revocato dal..."}]}}
```

---

## SSE Event Reference

All events are JSON objects with a `type` field. The complete set of events the iOS client **must** handle is listed below.

### `token`

A small text fragment (typically 1–5 tokens). Concatenate into a running buffer.

```json
{ "type": "token", "content": "I am analyzing your request" }
```

### `tool_call`

Notifies the client that the agent is invoking a tool. Useful for showing a "working…" indicator.

```json
{
  "type": "tool_call",
  "toolCall": {
    "name": "search_products",
    "args": { "query": "fungicidi vite", "limit": 10 },
    "id": "call_abc123"
  }
}
```

### `loop_warning`

Emitted when the agent exceeds `LOOP_WARNING_THRESHOLD` (8) consecutive tool calls. Content is in Italian.

```json
{
  "type": "loop_warning",
  "content": "Attenzione: 10 chiamate tool consecutive."
}
```

The client can display a subtle warning or ignore it. If the critical threshold (15) is reached the agent aborts automatically.

### `requires_approval`

The agent has paused at an **approval gate** and waits for user confirmation.

```json
{
  "type": "requires_approval",
  "toolCall": {
    "name": "approve_field_note",
    "args": {},
    "id": "call_approval_1"
  },
  "riskLevel": "medium"
}
```

| Field           | Type                          | Description                              |
| --------------- | ----------------------------- | ---------------------------------------- |
| `toolCall.name` | `string`                      | Tool that requires approval              |
| `toolCall.args` | `object`                      | Sanitized arguments (no UUIDs shown)     |
| `toolCall.id`   | `string`                      | Internal tool call ID                    |
| `riskLevel`     | `"low" \| "medium" \| "high"` | Risk classification — use for UI styling |

**Client behaviour:** show **Approve** / **Reject** buttons. The text that preceded this event contains the human-readable summary the user needs to review.

### `questionnaire_presented`

A structured form the user must fill in. Emitted **after** the streaming loop completes (not inline with tokens).

```json
{
  "type": "questionnaire_presented",
  "questionnaire": {
    "title": "Seleziona le unità produttive",
    "description": "Indica a quali unità produttive si riferisce l'operazione.",
    "questions": [
      {
        "id": "target_units",
        "question": "Quale unità produttiva?",
        "type": "multi_select",
        "required": true,
        "options": [
          {
            "label": "Vigneto Nord - 12.5 ha (Vite)",
            "value": "pu_1",
            "description": "Azienda: Seminai Fruit Farm"
          }
        ]
      },
      {
        "id": "treatment_date",
        "question": "Data del trattamento",
        "type": "text",
        "required": true,
        "placeholder": "es. 15 marzo 2026"
      }
    ]
  }
}
```

#### Questionnaire type reference

| Field                       | Type         | Notes                      |
| --------------------------- | ------------ | -------------------------- |
| `questionnaire.title`       | `string`     | Header for the form        |
| `questionnaire.description` | `string?`    | Optional context paragraph |
| `questionnaire.questions[]` | `Question[]` | One or more questions      |

**Question:**

| Field         | Type                                          | Notes                                           |
| ------------- | --------------------------------------------- | ----------------------------------------------- |
| `id`          | `string`                                      | Unique key — used to match answers              |
| `question`    | `string`                                      | The question text (label)                       |
| `type`        | `"single_select" \| "multi_select" \| "text"` | Input type                                      |
| `options`     | `QuestionOption[]?`                           | Required for `single_select` and `multi_select` |
| `required`    | `boolean`                                     | Whether an answer is mandatory                  |
| `placeholder` | `string?`                                     | Hint text for `text` inputs                     |

**QuestionOption:**

| Field         | Type      | Notes                        |
| ------------- | --------- | ---------------------------- |
| `label`       | `string`  | Display text                 |
| `value`       | `string`  | Value sent back on selection |
| `description` | `string?` | Optional detail line         |

**Answering:** send a normal follow-up message on the same `threadId` with the user's choices as natural language text.

### `complete`

Streaming finished successfully. Contains the authoritative final message and cost breakdown.

```json
{
  "type": "complete",
  "sources": [
    {
      "title": "Article Title",
      "url": "https://example.com/article",
      "fragment": "Relevant excerpt from the source..."
    }
  ],
  "cost": {
    "inputTokens": 1234,
    "outputTokens": 567,
    "tavilyCalls": 2,
    "totalCostUsd": 0.05,
    "costWithMarginUsd": 0.06,
    "provider": "openai",
    "modelName": "gpt-4o",
    "byProvider": {
      "openai": { "inputTokens": 1234, "outputTokens": 567, "costUsd": 0.05 }
    }
  },
  "response": {
    "status": "COMPLETED",
    "message": "Here is the final answer.",
    "sources": [
      {
        "title": "Article Title",
        "url": "https://example.com/article",
        "fragment": "Relevant excerpt..."
      }
    ]
  }
}
```

#### Cost object reference

| Field               | Type                     | Notes                                            |
| ------------------- | ------------------------ | ------------------------------------------------ |
| `inputTokens`       | `number`                 | Prompt tokens consumed                           |
| `outputTokens`      | `number`                 | Completion tokens generated                      |
| `tavilyCalls`       | `number`                 | Number of Tavily scientific search calls         |
| `totalCostUsd`      | `number`                 | Raw cost in USD                                  |
| `costWithMarginUsd` | `number`                 | Cost + 20% margin (amount deducted from credits) |
| `provider`          | `string?`                | e.g. `"openai"`                                  |
| `modelName`         | `string?`                | e.g. `"gpt-4o"`                                  |
| `byProvider`        | `Record<string, {...}>?` | Per-provider breakdown (multi-model scenarios)   |

#### Source citation object

| Field      | Type     | Notes                            |
| ---------- | -------- | -------------------------------- |
| `title`    | `string` | Source title                     |
| `url`      | `string` | Source URL                       |
| `fragment` | `string` | Relevant excerpt from the source |

### `error`

A fatal error that aborted the stream.

```json
{ "type": "error", "error": "Token budget superato (210000 > 200000). Turno interrotto." }
```

Common error strings:

| Error                                              | Cause                             |
| -------------------------------------------------- | --------------------------------- |
| `"Token budget superato (...). Turno interrotto."` | Exceeded `MAX_TOKENS_PER_MESSAGE` |
| `"No response generated."`                         | Graph produced no AI message      |
| `"Workspace access denied"`                        | User not in workspace             |
| Any other string                                   | Unexpected runtime error          |

---

## Event Sequencing

A typical stream follows this order:

```text
token* → tool_call → token* → tool_call → ... → token* → complete
```

With approval gate:

```text
token* → tool_call → token* (summary) → requires_approval
```

With questionnaire:

```text
token* → tool_call → token* → questionnaire_presented
```

Events that can appear at any point: `loop_warning`, `error`.

**Important:** `questionnaire_presented` is emitted **after** the streaming loop, not interleaved with `token` events.

---

## File upload over streaming

The same endpoint also accepts `multipart/form-data` with up to 10 files under `files`.
You can also pass structured mentions in the same request as a JSON string field named `mentions`.

```bash
curl -N -X POST "http://localhost:8081/agent-chat/stream" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Accept: text/event-stream" \
  -F 'threadId=3F95F58E-D7F0-4C03-BB51-6B0A44C216AA' \
  -F 'message=Import data from the attached file and create the company structure' \
  -F 'workspaceId=ws_123' \
  -F 'mentions=[{"type":"file","id":"file-db-id","label":"DDT Aprile"}]' \
  -F 'files=@/absolute/path/to/input.xlsx'
```

`mentions` provide DB-backed entity context (`company`, `product`, `field`, `production_unit`, `stock`, `file`).
`files` provide binary uploads in working memory for extraction tools.
When both are present, the backend enriches the prompt with both contexts.

## Non-Streaming Fallback

Use `POST /agent-chat/message` for a single JSON response.
This endpoint accepts mentions, but it does not upload binary files. Use `/stream` + `multipart/form-data` for actual file uploads.

```bash
curl -X POST "http://localhost:8081/agent-chat/message" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "3F95F58E-D7F0-4C03-BB51-6B0A44C216AA",
    "message": "Which products do I have for vineyard treatments?",
    "mentions": [
      { "type": "company", "id": "company-id", "label": "Societa Agricola Verdi" },
      { "type": "file", "id": "file-id", "label": "DDT concime ONE 40+12 SO3" }
    ]
  }'
```

Completed response:

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "Here are the products available for vineyard treatments..."
  }
}
```

Approval-needed response:

```json
{
  "status": "success",
  "data": {
    "status": "REQUIRES_APPROVAL",
    "message": "The agent requires approval to execute create_treatment_jobs",
    "pendingToolCalls": [
      { "name": "create_treatment_jobs", "args": { "planId": "plan_123" }, "id": "call_approval_1" }
    ]
  }
}
```

## Approve or Reject

### Approve

```bash
curl -X POST "http://localhost:8081/agent-chat/approve" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"3F95F58E-D7F0-4C03-BB51-6B0A44C216AA"}'
```

After approval, the backend may **auto-continue** executing subsequent low-risk tools (up to 5 iterations) without requiring further approval. The response reflects the final state after auto-continue completes.

### Reject with feedback

```bash
curl -X POST "http://localhost:8081/agent-chat/reject" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId":"3F95F58E-D7F0-4C03-BB51-6B0A44C216AA",
    "reason":"The date should be March 4th, not March 5th"
  }'
```

On rejection, the backend uses **fork-at-rejection** (time-travel to the pre-guard checkpoint) so the agent re-reasons with the user's feedback without re-executing the rejected tool. If no suitable checkpoint is found, it falls back to forward-cancel (injects synthetic cancellation messages).

### Approve / Reject response

Both endpoints return:

```json
{
  "status": "success",
  "data": {
    "status": "COMPLETED",
    "message": "The requested action has been handled successfully."
  }
}
```

Or, if approval triggers another approval gate:

```json
{
  "status": "success",
  "data": {
    "status": "REQUIRES_APPROVAL",
    "message": "Another action requires approval",
    "pendingToolCalls": [
      { "name": "optimize_selected_jobs", "args": { "selectedJobIds": ["..."] }, "id": "call_2" }
    ]
  }
}
```

---

## Risk Classification & Approval Gate

The agent classifies every destructive tool invocation using a **score-based risk system**. Only tools with score >= 30 trigger the approval gate; lower-risk tools are auto-approved.

### Risk levels

| Level    | Score range | Behaviour                                      |
| -------- | ----------- | ---------------------------------------------- |
| `low`    | < 30        | Auto-approved, no user interaction             |
| `medium` | 30–70       | `requires_approval` emitted, user must confirm |
| `high`   | > 70        | `requires_approval` emitted, user must confirm |

### Base risk scores

| Tool name                  | Base score | Default level | Description                           |
| -------------------------- | ---------- | ------------- | ------------------------------------- |
| `create_workspace_rule`    | 15         | low (auto)    | Creates a workspace rule              |
| `update_workspace_rule`    | 15         | low (auto)    | Updates a workspace rule              |
| `approve_field_note`       | 20         | low (auto)    | Saves field notes and stock movements |
| `create_job`               | 20         | low (auto)    | Creates a single job                  |
| `archive_workspace_rule`   | 20         | low (auto)    | Archives a workspace rule             |
| `create_treatment_jobs`    | 25         | low (auto)    | Creates treatment jobs from a plan    |
| `update_job`               | 25         | low (auto)    | Updates an existing job               |
| `confirm_conformity_check` | 25         | low (auto)    | Confirms a conformity check           |
| `execute_treatment_plan`   | 30         | medium        | Executes a full treatment plan        |
| `merge_treatment_dates`    | 30         | medium        | Merges treatment dates                |
| `create_company`           | 35         | medium        | Creates a new company                 |
| `create_fields`            | 35         | medium        | Creates fields                        |
| `create_production_units`  | 35         | medium        | Creates production units              |
| `update_production_units`  | 35         | medium        | Updates production units              |
| `import_stock_from_file`   | 35         | medium        | Imports stock from uploaded file      |
| `optimize_selected_jobs`   | 35         | medium        | Optimizes selected jobs               |
| `import_from_file`         | 40         | medium        | Imports data from uploaded file       |

### Dynamic score modifiers

The base score is increased by these factors:

| Condition                                                                | Modifier | Example                                |
| ------------------------------------------------------------------------ | -------- | -------------------------------------- |
| Bulk operation > 50 items                                                | +40      | `jobIds` array with 60 entries         |
| Bulk operation > 20 items                                                | +25      | `selectedJobIds` array with 30 entries |
| Irreversible overwrite (`overwrite: true` or `replacePdfFromChat: true`) | +30      | File replacement                       |

A tool with base score 25 handling 55 items gets score 65 (medium). One with base score 35 and overwrite gets 65 (medium). Combinations can push into `high` (> 70).

### What the user sees before approval

The agent streams a human-readable summary as `token` events before emitting `requires_approval`:

```text
📋 Categoria: Operazione di campo — aratura
🏢 Azienda: Seminai Fruit Farm
🌱 Unità Produttiva: Sorgo - Sorgo da granella (5.8 ha)
📅 Data: 5 marzo 2026
📝 Contenuto: "Ho arato l'unità produttiva di sorgo ieri mattina."
🏭 Campi interessati (3):
   1. Tredozio - F21 P45
   2. Tredozio - F22 P12
   3. Tredozio - F22 P13

⚠️ Verranno create 3 registrazioni (una per campo).
```

**No UUIDs or technical IDs are ever shown to the user.** Tool call args in `requires_approval` are sanitized.

### iOS UI suggestions by risk level

| `riskLevel` | Suggested UI                                               |
| ----------- | ---------------------------------------------------------- |
| `"low"`     | Should not appear (auto-approved), but handle gracefully   |
| `"medium"`  | Standard confirmation dialog with Approve / Reject buttons |
| `"high"`    | Warning-styled dialog (red accent, explicit warning text)  |

---

## Pending Tool Cancellation

If the user sends a **new message while the agent is paused at an approval gate**, the backend automatically cancels the pending tool calls before processing the new message. This prevents invalid message sequences. The client does not need to handle this explicitly — it is transparent.

---

## Restore State

```bash
curl "http://localhost:8081/agent-chat/state/3F95F58E-D7F0-4C03-BB51-6B0A44C216AA" \
  -H "Authorization: Bearer YOUR_JWT"
```

Response:

```json
{
  "status": "success",
  "data": {
    "messages": [{ "kwargs": { "content": "Plan a treatment for vineyard north" } }],
    "currentTask": "Generate treatment plan",
    "pendingAction": null,
    "loopCounter": 2,
    "lastToolCalls": ["search_products", "generate_plan"],
    "taskList": []
  }
}
```

`messages` is raw LangGraph state, so the iOS UI should prefer locally persisted chat items plus `complete.response.message`.

## Message History

For persisted chat history, use the dedicated chat endpoints instead of `/agent-chat/state/:threadId`.

List all dosage agent chats for the authenticated user:

```bash
curl "http://localhost:8081/chats?category=DOSAGE_AGENT" \
  -H "Authorization: Bearer YOUR_JWT"
```

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": "chat_123",
      "threadId": "3F95F58E-D7F0-4C03-BB51-6B0A44C216AA",
      "category": "DOSAGE_AGENT",
      "modelName": "gpt-4o",
      "createdAt": "2026-03-06T10:00:00.000Z",
      "updatedAt": "2026-03-06T10:03:00.000Z",
      "lastMessage": {
        "content": "Here is the final answer.",
        "role": "ASSISTANT",
        "createdAt": "2026-03-06T10:03:00.000Z"
      }
    }
  ]
}
```

Get one chat with all persisted messages:

```bash
curl "http://localhost:8081/chats/chat_123" \
  -H "Authorization: Bearer YOUR_JWT"
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": "chat_123",
    "threadId": "3F95F58E-D7F0-4C03-BB51-6B0A44C216AA",
    "category": "DOSAGE_AGENT",
    "modelName": "gpt-4o",
    "temperature": 0,
    "messages": [
      {
        "id": "msg_1",
        "role": "USER",
        "content": "Check whether Captano is revoked",
        "status": null,
        "error": null,
        "metadata": null,
        "createdAt": "2026-03-06T10:00:00.000Z"
      },
      {
        "id": "msg_2",
        "role": "ASSISTANT",
        "content": "Captano appears revoked in the current data.",
        "status": "COMPLETED",
        "error": null,
        "metadata": {
          "sources": [
            {
              "title": "Product label database",
              "url": "https://example.com/source",
              "fragment": "Captano revocato dal regolamento..."
            }
          ]
        },
        "createdAt": "2026-03-06T10:00:05.000Z"
      }
    ]
  }
}
```

Use `/chats` to build the conversation list screen and `/chats/:id` to reopen a thread with its stored messages.

## Error Shapes

Auth middleware can return:

```json
{ "message": "JWT token is missing" }
```

```json
{ "message": "Invalid JWT token" }
```

App-level errors usually return:

```json
{
  "status": "error",
  "message": "User is not a member of the specified workspace",
  "code": "WORKSPACE_ACCESS_DENIED"
}
```

## Swift Models

### Stream event decoding

```swift
// MARK: - SSE Event Types

enum AgentStreamEventType: String, Codable {
    case token
    case toolCall = "tool_call"
    case loopWarning = "loop_warning"
    case requiresApproval = "requires_approval"
    case questionnairePresented = "questionnaire_presented"
    case complete
    case error
}

struct AgentStreamEvent: Codable {
    let type: AgentStreamEventType
    let content: String?
    let toolCall: ToolCallInfo?
    let riskLevel: RiskLevel?
    let questionnaire: Questionnaire?
    let sources: [SourceCitation]?
    let cost: CostInfo?
    let response: AgentResponse?
    let error: String?
}

// MARK: - Risk Level

enum RiskLevel: String, Codable {
    case low
    case medium
    case high
}

// MARK: - Tool Call

struct ToolCallInfo: Codable {
    let name: String
    let args: [String: AnyCodable]
    let id: String?
}

// MARK: - Cost

struct CostInfo: Codable {
    let inputTokens: Int
    let outputTokens: Int
    let tavilyCalls: Int
    let totalCostUsd: Double
    let costWithMarginUsd: Double
    let provider: String?
    let modelName: String?
    let byProvider: [String: ProviderCost]?
}

struct ProviderCost: Codable {
    let inputTokens: Int
    let outputTokens: Int
    let costUsd: Double
}

// MARK: - Source Citation

struct SourceCitation: Codable {
    let title: String
    let url: String
    let fragment: String
}

// MARK: - Agent Response (inside complete event)

struct AgentResponse: Codable {
    let status: String           // "COMPLETED" | "REQUIRES_APPROVAL" | "ERROR"
    let message: String?
    let sources: [SourceCitation]?
    let error: String?
    let pendingToolCalls: [ToolCallInfo]?
}

// MARK: - Questionnaire

struct Questionnaire: Codable {
    let title: String
    let description: String?
    let questions: [Question]
}

struct Question: Codable {
    let id: String
    let question: String
    let type: QuestionType
    let options: [QuestionOption]?
    let required: Bool
    let placeholder: String?
}

enum QuestionType: String, Codable {
    case singleSelect = "single_select"
    case multiSelect = "multi_select"
    case text
}

struct QuestionOption: Codable {
    let label: String
    let value: String
    let description: String?
}
```

### Streaming client

```swift
func streamAgentMessage(
    token: String,
    threadId: String,
    message: String,
    modelName: String = "gpt-4o",
    temperature: Double = 0
) async throws {
    let url = URL(string: "http://localhost:8081/agent-chat/stream")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

    let body: [String: Any] = [
        "threadId": threadId,
        "message": message,
        "modelName": modelName,
        "temperature": temperature
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (bytes, response) = try await URLSession.shared.bytes(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        throw URLError(.badServerResponse)
    }

    var assistantContent = ""

    for try await line in bytes.lines {
        guard line.hasPrefix("data: ") else { continue }
        let data = Data(line.dropFirst(6).utf8)
        let event = try JSONDecoder().decode(AgentStreamEvent.self, from: data)

        switch event.type {
        case .token:
            assistantContent += event.content ?? ""
            await MainActor.run { updateMessageBubble(assistantContent) }

        case .toolCall:
            await MainActor.run { showToolCallIndicator(event.toolCall) }

        case .loopWarning:
            await MainActor.run { showLoopWarning(event.content) }

        case .requiresApproval:
            await MainActor.run {
                showApprovalButtons(
                    toolCall: event.toolCall,
                    riskLevel: event.riskLevel ?? .medium,
                    summaryText: assistantContent
                )
            }

        case .questionnairePresented:
            if let questionnaire = event.questionnaire {
                await MainActor.run { showQuestionnaire(questionnaire) }
            }

        case .complete:
            let finalText = event.response?.message ?? assistantContent
            await MainActor.run {
                finalizeMessage(
                    finalText,
                    cost: event.cost,
                    sources: event.sources ?? event.response?.sources
                )
            }

        case .error:
            await MainActor.run { showError(event.error ?? "Unknown error") }
        }
    }
}
```

### Approve / Reject helpers

```swift
func approveAction(token: String, threadId: String) async throws -> AgentResponse {
    let url = URL(string: "http://localhost:8081/agent-chat/approve")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(["threadId": threadId])
    let (data, _) = try await URLSession.shared.data(for: request)
    let wrapper = try JSONDecoder().decode(APIResponse<AgentResponse>.self, from: data)
    return wrapper.data
}

func rejectAction(token: String, threadId: String, reason: String?) async throws -> AgentResponse {
    let url = URL(string: "http://localhost:8081/agent-chat/reject")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    var body: [String: String] = ["threadId": threadId]
    if let reason { body["reason"] = reason }
    request.httpBody = try JSONEncoder().encode(body)
    let (data, _) = try await URLSession.shared.data(for: request)
    let wrapper = try JSONDecoder().decode(APIResponse<AgentResponse>.self, from: data)
    return wrapper.data
}

struct APIResponse<T: Codable>: Codable {
    let status: String
    let data: T
}
```

## Recommended Client Flow

1. Login and save the JWT in Keychain.
2. Create one `threadId` (UUID) per conversation.
3. Prefer `/agent-chat/stream` and concatenate `token` events into a running buffer.
4. On `tool_call`, show a tool activity indicator (e.g. "Searching products…").
5. On `loop_warning`, optionally show a subtle warning or ignore.
6. On `questionnaire_presented`, render a native form matching the question types (`single_select`, `multi_select`, `text`). Send answers as a follow-up message on the same thread.
7. On `requires_approval`, display **Approve** / **Reject** buttons. Use `riskLevel` to style the dialog (`medium` = standard, `high` = warning). The preceding `token` content is the summary.
8. On Approve, call `POST /agent-chat/approve`. On Reject, call `POST /agent-chat/reject` with the user's feedback in `reason`.
9. After approve/reject, check if the response has `status: "REQUIRES_APPROVAL"` — if so, show approval buttons again (cascading approvals).
10. On `complete`, use `response.message` as the authoritative text. Display `sources` with `title`, `url`, and `fragment`. Show `cost.costWithMarginUsd` if desired.
11. On `error`, display the error message and allow retry.
12. Keep `/agent-chat/message` as fallback when streaming is unavailable.
13. Use `/chats?category=DOSAGE_AGENT` for conversation list and `/chats/:id` to reload history.
