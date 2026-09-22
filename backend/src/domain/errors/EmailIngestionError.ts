/**
 * Domain errors for the email inbound connector.
 * Use AppError for HTTP-mapped errors; these are internal failure modes
 * the use-cases want to branch on explicitly.
 */
export class EmailIngestionError extends Error {
  constructor(
    public readonly code: EmailIngestionErrorCode,
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'EmailIngestionError';
    Object.setPrototypeOf(this, EmailIngestionError.prototype);
  }

  static unknownSender(fromAddress: string): EmailIngestionError {
    return new EmailIngestionError(
      'UNKNOWN_SENDER',
      `No user found for sender address: ${fromAddress}`,
    );
  }

  static duplicateIngestion(messageId: string): EmailIngestionError {
    return new EmailIngestionError(
      'DUPLICATE_INGESTION',
      `Email with Message-ID ${messageId} was already processed`,
    );
  }

  static disambiguationTokenInvalid(token: string): EmailIngestionError {
    return new EmailIngestionError(
      'DISAMBIGUATION_TOKEN_INVALID',
      `Disambiguation token not found or expired: ${token}`,
    );
  }

  static noCompanyAssociated(userId: string): EmailIngestionError {
    return new EmailIngestionError(
      'NO_COMPANY_ASSOCIATED',
      `User ${userId} has no company associated`,
    );
  }

  static attachmentLimitExceeded(detail: string): EmailIngestionError {
    return new EmailIngestionError('ATTACHMENT_LIMIT_EXCEEDED', detail);
  }
}

export type EmailIngestionErrorCode =
  | 'UNKNOWN_SENDER'
  | 'DUPLICATE_INGESTION'
  | 'DISAMBIGUATION_TOKEN_INVALID'
  | 'NO_COMPANY_ASSOCIATED'
  | 'ATTACHMENT_LIMIT_EXCEEDED';
