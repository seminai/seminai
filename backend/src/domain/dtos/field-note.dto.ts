import { FieldNoteCategory, FieldNoteProcessingStatus } from '@prisma/client';

/**
 * DTO for creating a new field note.
 */
export interface CreateFieldNoteDto {
  category: FieldNoteCategory;
  rawContent: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsAccuracy?: number;
  operationDate?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a field note.
 */
export interface UpdateFieldNoteDto {
  category?: FieldNoteCategory;
  rawContent?: string;
  status?: FieldNoteProcessingStatus;
  fieldId?: string | null;
  productionUnitId?: string | null;
  productId?: string | null;
  notes?: string;
  extractedData?: Record<string, unknown>;
  aiConfidenceScore?: number;
  conformityNotes?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * DTO for field details in field note response.
 */
export interface FieldNoteFieldDetailsDto {
  id: string;
  name: string;
  companyId: string | null;
  company?: {
    id: string;
    name: string;
  } | null;
}

/**
 * DTO for product details in field note response.
 */
export interface FieldNoteProductDetailsDto {
  id: string;
  name: string;
  sku: string;
  category: string;
  companyId: string | null;
  company?: {
    id: string;
    name: string;
  } | null;
}

/**
 * DTO for production unit details in field note response.
 */
export interface FieldNoteProductionUnitDetailsDto {
  id: string;
  name: string;
}

/**
 * DTO for field note response.
 */
export interface FieldNoteResponseDto {
  id: string;
  userId: string;
  category: FieldNoteCategory;
  status: FieldNoteProcessingStatus;
  rawContent: string;
  extractedData: Record<string, unknown> | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  gpsAccuracy: number | null;
  conformityNotes: Record<string, unknown> | Array<Record<string, unknown>> | null;
  operationDate: Date;
  fieldId: string | null;
  field?: FieldNoteFieldDetailsDto | null;
  productionUnitId: string | null;
  productionUnit?: FieldNoteProductionUnitDetailsDto | null;
  productId: string | null;
  product?: FieldNoteProductDetailsDto | null;
  jobId: string | null;
  metadata: Record<string, unknown> | null;
  aiConfidenceScore: number | null;
  notes: string | null;
  attachments: FieldNoteAttachmentResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for field note attachment response.
 */
export interface FieldNoteAttachmentResponseDto {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl: string | null;
  aiAnalysis: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * DTO for extracted data from AI processing.
 */
export interface FieldNoteExtractedDataDto {
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
  recognizedObservations?: Array<{
    type: string; // malattia, parassita, etc.
    name: string;
    severity?: string;
    confidence: number;
  }>;
  extractedQuantities?: Array<{
    value: number;
    unit: string;
    context: string;
  }>;
}

/**
 * DTO for AI processing result.
 */
export interface FieldNoteAiProcessingResultDto {
  success: boolean;
  confidenceScore: number;
  extractedData: FieldNoteExtractedDataDto;
  suggestedFieldId?: string;
  suggestedProductionUnitId?: string;
  suggestedProductIds?: string[];
  errors?: string[];
}

/**
 * DTO for field note filters.
 */
export interface FieldNoteFiltersDto {
  userId?: string;
  category?: FieldNoteCategory;
  status?: FieldNoteProcessingStatus;
  fieldId?: string;
  productionUnitId?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  hasLocation?: boolean;
}

/**
 * DTO for field note attachment creation.
 */
export interface CreateFieldNoteAttachmentDto {
  fieldNoteId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}
