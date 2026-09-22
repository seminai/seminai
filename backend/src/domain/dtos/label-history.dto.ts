/**
 * Represents a single field-level change in a label modification.
 */
export interface LabelFieldChange {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export enum LabelHistoryActor {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

/**
 * Input for creating a label history entry.
 */
export interface CreateLabelHistoryInput {
  readonly labelExtractionId: string;
  readonly userId?: string | null;
  readonly actorType?: LabelHistoryActor;
  readonly actorLabel?: string | null;
  readonly changes: ReadonlyArray<LabelFieldChange>;
  readonly previousSnapshot: Record<string, unknown>;
}

/**
 * Domain record for a label history entry.
 */
export interface LabelHistoryRecord {
  readonly id: string;
  readonly labelExtractionId: string;
  readonly userId: string | null;
  readonly actorType: LabelHistoryActor;
  readonly actorLabel: string | null;
  readonly changes: ReadonlyArray<LabelFieldChange>;
  readonly previousSnapshot: Record<string, unknown>;
  readonly createdAt: Date;
}

/**
 * Label history entry enriched with user information for API responses.
 */
export interface LabelHistoryWithUser extends LabelHistoryRecord {
  readonly userName: string;
  readonly userProfilePictureUrl: string | null;
}
