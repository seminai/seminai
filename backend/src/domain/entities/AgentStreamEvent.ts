/**
 * Append-only record of a single event emitted during an agent stream run.
 *
 * The set of events for a given threadId, ordered by `seq` ASC, fully describes
 * the evolution of the assistant's reasoning and is replayable by a client
 * that reconnects after a refresh or network blip.
 */
export class AgentStreamEvent {
  constructor(
    public readonly id: string,
    public readonly threadId: string,
    public readonly seq: number,
    public readonly type: string,
    public readonly payload: Record<string, unknown>,
    public readonly createdAt: Date,
  ) {}
}
