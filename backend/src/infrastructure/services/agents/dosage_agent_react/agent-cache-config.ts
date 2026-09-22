export interface AgentCacheConfig {
  readonly userId?: string;
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly modelName: string;
  readonly temperature?: number;
  readonly skipRAG: boolean;
  readonly skipDisciplinariPdf: boolean;
  readonly requireApproval: boolean;
  /** Active tool bundle for this thread; bundle changes invalidate the cached app. */
  readonly toolBundle: string;
  /** Agent domain (DOSAGE | MANUFACTURING); a domain change rebuilds the graph. */
  readonly domain?: string;
  /**
   * `clientContext.formMode` value when known. Gates the FORM_EDITOR tools in
   * `tool-registry.ts`, so entering/leaving form mode in the same thread must
   * rebuild the graph.
   */
  readonly formMode?: string;
  /** Resolved LLM provider identifier (e.g. `openai`, `anthropic`). */
  readonly provider: string;
  /** Resolved low/medium/high model routing fingerprint. */
  readonly modelRoutingFingerprint: string;
  /**
   * Stable fingerprint of the inputs that determine the *effective* toolset
   * beyond `toolBundle` and `formMode`: vector store availability, tavily key
   * presence, and similar flags. JSON-serialized for cheap equality checks.
   */
  readonly capabilityFingerprint: string;
}

export function canReuseCachedAgentConfig(
  cached: AgentCacheConfig,
  requested: AgentCacheConfig,
): boolean {
  const sameIdentity =
    cached.userId === requested.userId &&
    (requested.jobId == null || cached.jobId === requested.jobId) &&
    (requested.workspaceId == null || cached.workspaceId === requested.workspaceId) &&
    cached.modelName === requested.modelName &&
    cached.temperature === requested.temperature &&
    cached.toolBundle === requested.toolBundle &&
    cached.domain === requested.domain &&
    cached.formMode === requested.formMode &&
    cached.provider === requested.provider &&
    cached.modelRoutingFingerprint === requested.modelRoutingFingerprint &&
    cached.capabilityFingerprint === requested.capabilityFingerprint;
  if (!sameIdentity) {
    return false;
  }
  const ragCompatible = requested.skipRAG || cached.skipRAG === requested.skipRAG;
  const disciplinariCompatible =
    requested.skipDisciplinariPdf || cached.skipDisciplinariPdf === requested.skipDisciplinariPdf;
  const approvalCompatible = cached.requireApproval === requested.requireApproval;
  return ragCompatible && disciplinariCompatible && approvalCompatible;
}
