# Dosage ReAct Agent - iOS Integration Guide — Part 1

[Back to the guide index](../DOSAGE_REACT_AGENT_IOS_INTEGRATION.md)


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
