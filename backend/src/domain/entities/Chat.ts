import { Message } from './Message';

export enum ChatCategory {
  DOSAGE_AGENT = 'DOSAGE_AGENT',
  JOB_VERIFICATION_AGENT = 'JOB_VERIFICATION_AGENT',
}

/**
 * Represents a chat session with metadata and messages.
 */
export class Chat {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly category: ChatCategory,
    public readonly threadId: string,
    public readonly modelName?: string,
    public readonly temperature?: number,
    public readonly metadata?: Record<string, unknown>,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
    public readonly messages?: Message[],
  ) {}

  /**
   * Creates a new Chat instance with defaults.
   */
  static create(props: {
    id?: string;
    userId: string;
    category?: ChatCategory;
    threadId: string;
    modelName?: string;
    temperature?: number;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
    messages?: Message[];
  }): Chat {
    return new Chat(
      props.id ?? crypto.randomUUID(),
      props.userId,
      props.category ?? ChatCategory.DOSAGE_AGENT,
      props.threadId,
      props.modelName,
      props.temperature,
      props.metadata,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
      props.messages,
    );
  }
}
