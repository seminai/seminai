export interface FieldNoteCompanyRef {
  readonly id: string;
  readonly name: string;
}

export interface FieldNoteFieldRef {
  readonly id: string;
  readonly name: string;
}

export interface FieldNoteProductionUnitRef {
  readonly id: string;
  readonly name: string;
}

export interface FieldNoteProductRef {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly category: string;
  readonly companyId: string | null;
  readonly company: FieldNoteCompanyRef | null;
}

export interface FieldNoteAttachmentRef {
  readonly id: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly fileType: string;
  readonly fileSize: number;
  readonly thumbnailUrl: string | null;
}

export type FieldNoteCategory =
  | 'OPERATION'
  | 'OBSERVATION'
  | 'MEASUREMENT'
  | 'HARVEST'
  | 'MAINTENANCE'
  | 'OTHER';

export type FieldNoteStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'MANUALLY_REVIEWED';

export interface FieldNoteResponse {
  readonly id: string;
  readonly userId: string;
  readonly category: FieldNoteCategory;
  readonly status: FieldNoteStatus;
  readonly rawContent: string;
  readonly extractedData: Record<string, unknown> | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly altitude: number | null;
  readonly gpsAccuracy: number | null;
  readonly conformityNotes: Record<string, unknown> | ReadonlyArray<Record<string, unknown>> | null;
  readonly operationDate: string;
  readonly fieldId: string | null;
  readonly field: FieldNoteFieldRef | null;
  readonly relatedFields: ReadonlyArray<FieldNoteFieldRef>;
  readonly productionUnitId: string | null;
  readonly productionUnit: FieldNoteProductionUnitRef | null;
  readonly productId: string | null;
  readonly product: FieldNoteProductRef | null;
  readonly company: FieldNoteCompanyRef | null;
  readonly jobId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly aiConfidenceScore: number | null;
  readonly notes: string | null;
  readonly attachments: readonly FieldNoteAttachmentRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const FIELD_NOTE_CATEGORY_LABELS: Record<FieldNoteCategory, string> = {
  OPERATION: 'Operazione',
  OBSERVATION: 'Osservazione',
  MEASUREMENT: 'Misurazione',
  HARVEST: 'Raccolta',
  MAINTENANCE: 'Manutenzione',
  OTHER: 'Altro',
} as const;

export const FIELD_NOTE_STATUS_LABELS: Record<FieldNoteStatus, string> = {
  PENDING: 'In attesa',
  PROCESSING: 'In elaborazione',
  PROCESSED: 'Elaborato',
  FAILED: 'Errore',
  MANUALLY_REVIEWED: 'Revisionato',
} as const;
