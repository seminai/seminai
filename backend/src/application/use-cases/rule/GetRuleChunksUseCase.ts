import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';
import { createVectorSearchQdrantService } from '../../../infrastructure/services/tool/vectorSearchQdrant';
import { resolveRulesQdrantCollection } from '../../../infrastructure/services/llm/qdrantNamespace';

interface GetRuleChunksRequest {
  readonly ruleId: string;
  readonly userId: string;
  readonly limit?: number;
}

export interface RuleChunkPreview {
  readonly content: string;
  readonly chunkIndex: number;
  readonly chunkType?: 'table' | 'text';
  readonly page?: number;
  readonly tableHeaders?: ReadonlyArray<string>;
  readonly sectionName?: string;
}

interface GetRuleChunksResponse {
  readonly ruleId: string;
  readonly isVectorized: boolean;
  readonly chunks: ReadonlyArray<RuleChunkPreview>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Returns a sample of vectorized chunks for a rule, for UI preview / debugging.
 */
export class GetRuleChunksUseCase {
  constructor(
    private readonly ruleRepository: IRuleRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: GetRuleChunksRequest): Promise<GetRuleChunksResponse> {
    const rule = await this.ruleRepository.findById(request.ruleId);
    if (!rule) throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');

    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      rule.workspaceId,
      request.userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    if (!rule.isVectorized) {
      return { ruleId: rule.id, isVectorized: false, chunks: [] };
    }

    const limit = clampLimit(request.limit);
    const vectorService = createVectorSearchQdrantService(resolveRulesQdrantCollection());
    const points = await vectorService.scrollByRuleId(rule.workspaceId, rule.id, limit);

    const chunks: RuleChunkPreview[] = points
      .map((p) => mapChunk(p.metadata, p.pageContent))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    return { ruleId: rule.id, isVectorized: true, chunks };
  }
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function mapChunk(metadata: Record<string, unknown>, content: string): RuleChunkPreview {
  const chunkIndex = readInt(metadata.chunkIndex) ?? 0;
  const page = readInt(metadata.page) ?? readInt(metadata.pageNumber);
  const chunkType =
    metadata.chunkType === 'table' || metadata.chunkType === 'text'
      ? metadata.chunkType
      : undefined;
  const tableHeaders = Array.isArray(metadata.tableHeaders)
    ? (metadata.tableHeaders as unknown[]).filter((h): h is string => typeof h === 'string')
    : undefined;
  const sectionName = typeof metadata.sectionName === 'string' ? metadata.sectionName : undefined;
  return { content, chunkIndex, page, chunkType, tableHeaders, sectionName };
}

function readInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
  }
  return undefined;
}
