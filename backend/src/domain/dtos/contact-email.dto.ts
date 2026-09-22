export interface EmailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: string;
}

/**
 * Defines the payload required to forward a contact email request.
 */
export interface ContactEmailDTO {
  readonly name: string;
  readonly email: string;
  readonly body: string;
  readonly attachments?: EmailAttachment[];
}
