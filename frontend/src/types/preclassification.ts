export type PreclassificationItemStatus = 'pending' | 'classified' | 'error';

/** Per-file suggestion held in the hook's map and applied to the classify selects. */
export interface PreclassificationSuggestion {
  readonly status: PreclassificationItemStatus;
  readonly documentCategory: string | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
}

/** Per-file entry returned by POST /extractions/preclassify. */
export interface StartPreclassificationItem {
  readonly itemId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly status: PreclassificationItemStatus;
}

export interface StartPreclassificationResponse {
  readonly status: string;
  readonly data: {
    readonly preclassId: string;
    readonly items: readonly StartPreclassificationItem[];
  };
}

export interface PreclassificationStatusItem {
  readonly itemId: string;
  readonly fileName: string;
  readonly status: PreclassificationItemStatus;
  readonly documentCategory: string | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly error: string | null;
}

export interface PreclassificationStatusResponse {
  readonly status: string;
  readonly data: {
    readonly preclassId: string;
    readonly items: readonly PreclassificationStatusItem[];
  };
}

// --- Socket.IO event payloads ---

export interface PreclassificationItemEvent {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly documentCategory: string | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly status: 'classified';
}

export interface PreclassificationItemErrorEvent {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly error: string;
}

export interface PreclassificationDoneEvent {
  readonly preclassId: string;
}
