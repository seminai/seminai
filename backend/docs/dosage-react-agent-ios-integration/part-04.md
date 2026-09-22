# Dosage ReAct Agent - iOS Integration Guide — Part 4

[Back to the guide index](../DOSAGE_REACT_AGENT_IOS_INTEGRATION.md)

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
