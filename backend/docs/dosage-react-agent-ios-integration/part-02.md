# Dosage ReAct Agent - iOS Integration Guide — Part 2

[Back to the guide index](../DOSAGE_REACT_AGENT_IOS_INTEGRATION.md)

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
