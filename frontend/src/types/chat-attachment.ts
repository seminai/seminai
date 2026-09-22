export type ChatAttachmentKind = 'image' | 'document' | 'other';

export type ChatAttachmentStatus = 'uploading' | 'sent' | 'error';

export interface ChatAttachmentViewModel {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly kind: ChatAttachmentKind;
  readonly url?: string;
  readonly file?: File;
  readonly status: ChatAttachmentStatus;
}
