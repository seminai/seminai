import { prisma } from '../../../../repositories/Prisma';
import { AgentMemoryType, Prisma } from '@prisma/client';

export interface MemoryEntry {
  readonly id: string;
  readonly type: AgentMemoryType;
  readonly key: string;
  readonly content: Prisma.JsonValue;
  readonly importance: number;
  readonly accessCount: number;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
}

interface SaveMemoryParams {
  readonly userId: string;
  readonly type: AgentMemoryType;
  readonly key: string;
  readonly content: Prisma.InputJsonValue;
  readonly importance?: number;
  readonly expiresAt?: Date;
}

/**
 * Persistent multi-level memory service for the ReAct agent.
 * Implements CORE, EPISODIC, PROCEDURAL, SEMANTIC memory types (MIRIX pattern).
 */
export class AgentMemoryService {
  /**
   * Upserts a memory entry. If (userId, type, key) already exists, updates content.
   */
  async save(params: SaveMemoryParams): Promise<MemoryEntry> {
    const { userId, type, key, content, importance = 1.0, expiresAt } = params;

    const row = await prisma.agentMemory.upsert({
      where: { userId_type_key: { userId, type, key } },
      create: {
        userId,
        type,
        key,
        content,
        importance,
        expiresAt,
        lastUsedAt: new Date(),
      },
      update: {
        content,
        importance,
        expiresAt,
        lastUsedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });

    return this.toEntry(row);
  }

  /**
   * Saves an episodic memory (session summary).
   */
  async saveEpisodicMemory(
    userId: string,
    sessionKey: string,
    summary: Prisma.InputJsonValue,
    importance = 1.0,
  ): Promise<MemoryEntry> {
    return this.save({
      userId,
      type: AgentMemoryType.EPISODIC,
      key: sessionKey,
      content: summary,
      importance,
    });
  }

  /**
   * Saves stable user profile information that should survive across threads.
   */
  async saveCoreMemory(
    userId: string,
    key: string,
    content: Prisma.InputJsonValue,
    importance = 2.0,
  ): Promise<MemoryEntry> {
    return this.save({
      userId,
      type: AgentMemoryType.CORE,
      key,
      content,
      importance,
    });
  }

  /**
   * Saves a procedural memory (reusable workflow/skill).
   */
  async saveProcedural(
    userId: string,
    workflowKey: string,
    steps: Prisma.InputJsonValue,
    importance = 1.5,
  ): Promise<MemoryEntry> {
    return this.save({
      userId,
      type: AgentMemoryType.PROCEDURAL,
      key: workflowKey,
      content: steps,
      importance,
    });
  }

  /**
   * Loads CORE memory for a user (stable preferences, defaults).
   */
  async loadCoreMemory(userId: string): Promise<readonly MemoryEntry[]> {
    return this.loadByType(userId, AgentMemoryType.CORE);
  }

  /**
   * Loads relevant memories of any type, filtering out expired entries.
   * Ordered by importance desc, then lastUsedAt desc.
   */
  async loadRelevantMemories(
    userId: string,
    options?: { types?: AgentMemoryType[]; limit?: number },
  ): Promise<readonly MemoryEntry[]> {
    const { types, limit = 20 } = options ?? {};
    const now = new Date();

    const where: Prisma.AgentMemoryWhereInput = {
      userId,
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const rows = await prisma.agentMemory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }],
      take: limit,
    });

    // Touch access count without blocking
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      void prisma.agentMemory
        .updateMany({
          where: { id: { in: ids } },
          data: { lastUsedAt: now, accessCount: { increment: 1 } },
        })
        .catch(() => {});
    }

    return rows.map(this.toEntry);
  }

  /**
   * Loads all non-expired memories of a specific type.
   */
  async loadByType(
    userId: string,
    type: AgentMemoryType,
    limit = 50,
  ): Promise<readonly MemoryEntry[]> {
    return this.loadRelevantMemories(userId, { types: [type], limit });
  }

  /**
   * Deletes a specific memory entry.
   */
  async delete(id: string): Promise<void> {
    await prisma.agentMemory.delete({ where: { id } });
  }

  /**
   * Deletes all memories for a user.
   */
  async deleteAllForUser(userId: string): Promise<number> {
    const result = await prisma.agentMemory.deleteMany({ where: { userId } });
    return result.count;
  }

  /**
   * Finds a memory by exact (userId, type, key).
   */
  async findByKey(userId: string, type: AgentMemoryType, key: string): Promise<MemoryEntry | null> {
    const row = await prisma.agentMemory.findUnique({
      where: { userId_type_key: { userId, type, key } },
    });
    return row ? this.toEntry(row) : null;
  }

  /**
   * Formats memories into a context string for injection into the system prompt.
   */
  formatForPrompt(memories: readonly MemoryEntry[]): string | null {
    if (memories.length === 0) return null;

    const sections: string[] = [];

    const core = memories.filter((m) => m.type === AgentMemoryType.CORE);
    if (core.length > 0) {
      sections.push(
        '## Profilo Utente',
        ...core.map((m) => `- ${m.key}: ${JSON.stringify(m.content)}`),
      );
    }

    const procedural = memories.filter((m) => m.type === AgentMemoryType.PROCEDURAL);
    if (procedural.length > 0) {
      sections.push(
        '## Procedure Note',
        ...procedural.map((m) => `- ${m.key}: ${JSON.stringify(m.content)}`),
      );
    }

    const episodic = memories.filter((m) => m.type === AgentMemoryType.EPISODIC);
    if (episodic.length > 0) {
      sections.push(
        '## Sessioni Precedenti',
        ...episodic.map((m) => `- ${m.key}: ${JSON.stringify(m.content)}`),
      );
    }

    const semantic = memories.filter((m) => m.type === AgentMemoryType.SEMANTIC);
    if (semantic.length > 0) {
      sections.push(
        '## Conoscenza Appresa',
        ...semantic.map((m) => `- ${m.key}: ${JSON.stringify(m.content)}`),
      );
    }

    return sections.join('\n');
  }

  private toEntry(row: import('@prisma/client').AgentMemory): MemoryEntry {
    return {
      id: row.id,
      type: row.type,
      key: row.key,
      content: row.content,
      importance: row.importance,
      accessCount: row.accessCount,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
    };
  }
}
