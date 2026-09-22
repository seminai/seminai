# Guida Integrazione Frontend - Field Notes System — Part 4

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

```typescript
const response = await fetch('http://localhost:8081/field-note-agent/reject', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    threadId: threadId,
    feedback: 'No, il campo era vigneto sud, non campo vite'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "status": "REQUIRES_APPROVAL",
    "message": "Ho capito, riclassifico con il campo 'vigneto sud'..."
  }
}
```

### 5. Ottenere Stato Conversazione

**GET** `/field-note-agent/state/:threadId`

```typescript
const response = await fetch(
  `http://localhost:8081/field-note-agent/state/${threadId}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// Response 200
{
  "status": "success",
  "data": {
    "messages": [
      { "role": "human", "content": "ho dato 10 kg di rame..." },
      { "role": "ai", "content": "Ho analizzato..." },
      // ... altri messaggi
    ],
    "pendingFieldNote": {
      "category": "OPERATION",
      "rawContent": "ho dato 10 kg di rame nel campo vite",
      "extractedData": { ... }
    }
  }
}
```

---

## TypeScript Types

```typescript
// Enums
export enum FieldNoteCategory {
  OPERATION = 'OPERATION',
  OBSERVATION = 'OBSERVATION',
  MEASUREMENT = 'MEASUREMENT',
  HARVEST = 'HARVEST',
  MAINTENANCE = 'MAINTENANCE',
  OTHER = 'OTHER',
}

export enum FieldNoteStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  MANUALLY_REVIEWED = 'MANUALLY_REVIEWED',
}

export enum AgentResponseStatus {
  COMPLETED = 'COMPLETED',
  REQUIRES_APPROVAL = 'REQUIRES_APPROVAL',
  ERROR = 'ERROR',
}

// Field Note Types
export interface FieldNote {
  id: string;
  userId: string;
  category: FieldNoteCategory;
  status: FieldNoteStatus;
  rawContent: string;
  extractedData: ExtractedData | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  gpsAccuracy: number | null;
  operationDate: string; // ISO 8601
  fieldId: string | null;
  fieldName?: string | null;
  productionUnitId: string | null;
  productionUnitName?: string | null;
  productId: string | null;
  productName?: string | null;
  jobId: string | null;
  metadata: Record<string, any> | null;
  aiConfidenceScore: number | null;
  notes: string | null;
  attachments: FieldNoteAttachment[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ExtractedData {
  recognizedProducts?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    productId?: string;
  }>;
  recognizedFields?: Array<{
    name: string;
    fieldId?: string;
  }>;
  operation?: string;
  observations?: string[];
  measurements?: Array<{
    type: string;
    value: number;
    unit: string;
  }>;
}

export interface FieldNoteAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  aiAnalysis: Record<string, any> | null;
  createdAt: string;
}

// Agent Types
export interface AgentStreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'complete' | 'requires_approval' | 'error';
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    id?: string;
  };
  error?: string;
  response?: AgentResponse;
}

export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    id: string;
  }>;
  error?: string;
  pendingFieldNote?: {
    category: FieldNoteCategory;
    rawContent: string;
    extractedData: ExtractedData;
  };
}

// Request Types
export interface CreateFieldNoteRequest {
  category: FieldNoteCategory;
  rawContent: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsAccuracy?: number;
  operationDate?: string;
  metadata?: Record<string, any>;
}

export interface UpdateFieldNoteRequest {
  category?: FieldNoteCategory;
  rawContent?: string;
  status?: FieldNoteStatus;
  fieldId?: string | null;
  productionUnitId?: string | null;
  productId?: string | null;
  notes?: string;
  extractedData?: ExtractedData;
  aiConfidenceScore?: number;
}

export interface ChatMessageRequest {
  threadId: string;
  message: string;
  modelName?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';
  temperature?: number;
}
```

---

## Esempi di Integrazione

### React Example - Chat Component con Streaming
