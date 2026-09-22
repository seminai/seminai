# Dosage ReAct Agent - iOS Integration Guide — Part 3

[Back to the guide index](../DOSAGE_REACT_AGENT_IOS_INTEGRATION.md)

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
