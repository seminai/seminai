import { type EmailIngestionStatus } from '@prisma/client';

/**
 * Inbound email received via the email connector.
 * Pure domain entity — no Prisma or Express imports.
 */
export class EmailIngestion {
  constructor(
    public readonly id: string,
    public readonly messageId: string,
    public readonly status: EmailIngestionStatus,
    public readonly fromAddress: string,
    public readonly toAddress: string,
    public readonly receivedAt: Date,
    public readonly subject?: string,
    public readonly bodyText?: string,
    public readonly threadId?: string,
    public readonly userId?: string,
    public readonly companyId?: string,
    public readonly parentIngestionId?: string,
    public readonly disambiguationToken?: string,
    public readonly errorMessage?: string,
    public readonly dispatchedAt?: Date,
  ) {}

  /** Whether this ingestion is still awaiting the user to pick a company. */
  isAwaitingDisambiguation(): boolean {
    return this.status === 'AWAITING_DISAMBIGUATION';
  }

  /** Whether the agent has already been triggered for this ingestion. */
  isDispatched(): boolean {
    return this.status === 'DISPATCHED';
  }
}
