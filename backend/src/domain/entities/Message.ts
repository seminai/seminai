export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  SYSTEM = 'SYSTEM',
  TOOL = 'TOOL',
}

export enum AgentResponseStatus {
  COMPLETED = 'COMPLETED',
  REQUIRES_APPROVAL = 'REQUIRES_APPROVAL',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
}

export interface ContentBlock {
  type: 'text' | 'code' | 'citation';
  content: string;
  language?: string;
  [key: string]: any;
}

export interface MessageCost {
  inputTokens?: number;
  outputTokens?: number;
  tavilyCalls?: number;
  totalCostUsd?: number;
  costWithMarginUsd?: number;
  [key: string]: any;
}

export class Message {
  constructor(
    public readonly id: string,
    public readonly chatId: string,
    public readonly role: MessageRole,
    public readonly content: string,
    public readonly sequence: number,
    public readonly contentBlocks?: ContentBlock[],
    public readonly status?: AgentResponseStatus,
    public readonly pendingToolCalls?: any[],
    public readonly error?: string,
    public readonly cost?: MessageCost,
    public readonly metadata?: Record<string, any>,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
  ) {}

  static create(props: {
    id?: string;
    chatId: string;
    role: MessageRole;
    content: string;
    sequence?: number;
    contentBlocks?: ContentBlock[];
    status?: AgentResponseStatus;
    pendingToolCalls?: any[];
    error?: string;
    cost?: MessageCost;
    metadata?: Record<string, any>;
    createdAt?: Date;
    updatedAt?: Date;
  }): Message {
    return new Message(
      props.id ?? crypto.randomUUID(),
      props.chatId,
      props.role,
      props.content,
      props.sequence ?? 0,
      props.contentBlocks,
      props.status,
      props.pendingToolCalls,
      props.error,
      props.cost,
      props.metadata,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
    );
  }
}
