# Guida Integrazione Mobile - Seminai API — Part 7

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)

```typescript
// ========== AUTH ==========

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string; // Min 6 caratteri
  name: string;
  surname?: string;
  phoneNumber?: string;
  fiscalCode?: string;
  address?: string;
  profilePictureUrl?: string;
}

interface GoogleLoginRequest {
  idToken: string;
}

interface AuthResponse {
  status: 'success';
  data: {
    token: string;
    user: UserBasic;
  };
}

interface UserBasic {
  id: string;
  email: string;
  name: string;
  role: 'BASIC' | 'ADMIN' | 'LABEL_MANAGER';
  credits: number;
}

interface UserFull extends UserBasic {
  surname: string | null;
  fiscalCode: string | null;
  companyName: string | null;
  vatNumber: string | null;
  phoneNumber: string | null;
  address: string | null;
  profilePictureUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== FIELD NOTES ==========

type FieldNoteCategory =
  | 'OPERATION'
  | 'OBSERVATION'
  | 'MEASUREMENT'
  | 'HARVEST'
  | 'MAINTENANCE'
  | 'OTHER';

type FieldNoteStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'MANUALLY_REVIEWED';

interface CreateFieldNoteRequest {
  category: FieldNoteCategory;
  rawContent: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsAccuracy?: number;
  operationDate?: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

interface UpdateFieldNoteRequest {
  category?: FieldNoteCategory;
  rawContent?: string;
  status?: FieldNoteStatus;
  fieldId?: string | null;
  productionUnitId?: string | null;
  productId?: string | null;
  notes?: string;
  extractedData?: Record<string, unknown>;
  aiConfidenceScore?: number;
}

interface FieldNote {
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
  operationDate: string;
  fieldId: string | null;
  field?: { id: string; name: string; area: number } | null;
  relatedFields?: Array<{ id: string; name: string }>;
  productionUnitId: string | null;
  productionUnit?: { id: string; name: string } | null;
  productId: string | null;
  product?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
  jobId: string | null;
  metadata: Record<string, unknown> | null;
  aiConfidenceScore: number | null;
  notes: string | null;
  conformityNotes: Record<string, unknown>[] | null;
  attachments: FieldNoteAttachment[];
  createdAt: string;
  updatedAt: string;
}

interface ExtractedData {
  recognizedProducts?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    confidence: number;
  }>;
  recognizedField?: {
    name: string;
    confidence: number;
  };
  recognizedProductionUnit?: {
    name: string;
    confidence: number;
  };
  recognizedOperation?: {
    type: string;
    description: string;
  };
}

interface FieldNoteAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  aiAnalysis: Record<string, unknown> | null;
  createdAt: string;
}

interface FieldNoteStats {
  totalNotes: number;
  byStatus: Record<FieldNoteStatus, number>;
}

// ========== DOSAGE AGENT ==========

interface StreamRequest {
  threadId: string;
  message: string;
  modelName?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';
  temperature?: number;
  jobId?: string;
  workspaceId?: string;
}

type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; content: string }
  | { type: 'requires_approval'; toolCall?: ToolCall }
  | { type: 'questionnaire'; questionnaire: Questionnaire }
  | { type: 'plan'; plan: TreatmentPlan }
  | { type: 'complete'; sources?: Source[]; cost?: CostMetrics; response?: AgentResponse }
  | { type: 'error'; error: string };

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

interface AgentResponse {
  status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';
  message?: string;
  pendingToolCalls?: ToolCall[];
  sources?: Source[];
  error?: string;
}

interface Source {
  title: string;
  url?: string;
}

interface CostMetrics {
  totalTokens: number;
  totalCost: number;
}

interface StartJobRequest {
  products: Array<{
    productName: string;
    quantity: number;
    quantityUnitOfMeasure: string;
    strategy?: 'min' | 'max' | 'avg' | 'current';
  }>;
  unitOfProduction: Array<{
    id: string;
    cropName: string;
    cropVariety?: string;
    disciplinari?: string[];
  }>;
  strategy?: 'min' | 'max' | 'avg' | 'current';
  startAt?: string;
  endAt?: string;
  outStockLimiter?: boolean;
}

interface JobStatus {
  id: string;
  state: 'queued' | 'waiting' | 'active' | 'completed' | 'failed' | 'stalled';
  progress: number;
  data?: {
    productsCount: number;
    unitsCount: number;
    unitsProcessed?: number;
  };
  result?: Record<string, unknown>;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}

// ========== SETTINGS ==========

interface CreateSettingsRequest {
  language: string; // Es: 'it', 'en', 'fr'
  qdcApiKey?: string;
  ifarmingApiKey?: string;
}

interface UpdateSettingsRequest {
  language?: string;
  qdcApiKey?: string | null; // null per rimuovere
  ifarmingApiKey?: string | null;
}

interface Settings {
  id: string;
  userId: string;
  language: string;
  qdcApiKey: string | null;
  ifarmingApiKey: string | null;
  whatsappInstanceName: string | null;
  whatsappConnected: boolean;
  whatsappPhoneNumber: string | null;
  whatsappAllowedNumbers: string[];
  createdAt: string;
  updatedAt: string;
}
