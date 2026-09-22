import { StructuredTool } from '@langchain/core/tools';
import { BUNDLE_CATEGORIES, MANUFACTURING_TOOL_ALLOWLIST, ToolBundle, ToolCategory, ToolFlags, ToolRegistryConfig } from './tool-registry.part-01-tool-category';
import { buildTools } from './tool-registry.part-02-build-tools';

/**
 * Builds the tool list filtered to the categories included in the given bundle.
 * The chosen bundle is fixed for the lifetime of the thread so the OpenAI
 * prompt-cache prefix stays stable across turns. `flags` are recomputed to
 * reflect ONLY the tools actually exposed, so `buildSystemPrompt` doesn't
 * advertise capabilities the agent doesn't have.
 */
export function buildToolsForBundle(
  bundle: ToolBundle,
  cfg: ToolRegistryConfig,
): {
  tools: StructuredTool[];
  toolsByCategory: ReadonlyMap<ToolCategory, StructuredTool[]>;
  flags: ToolFlags;
  bundle: ToolBundle;
} {
  const full = buildTools(cfg);
  if (bundle === 'FULL') {
    return { ...full, bundle };
  }
  const allowed = BUNDLE_CATEGORIES[bundle];
  // Manufacturing narrows the selected categories to a name-level allowlist,
  // because CONTEXT_DISCOVERY/ENTITY_MANAGEMENT/STOCK also contain agronomic tools.
  const nameAllowlist = bundle === 'MANUFACTURING' ? MANUFACTURING_TOOL_ALLOWLIST : null;
  const isToolAllowed = (tool: StructuredTool): boolean =>
    nameAllowlist === null || nameAllowlist.has(tool.name);
  const filteredByCategory = new Map<ToolCategory, StructuredTool[]>();
  for (const [category, categoryTools] of full.toolsByCategory) {
    if (!allowed.has(category)) continue;
    const kept = categoryTools.filter(isToolAllowed);
    if (kept.length > 0) {
      filteredByCategory.set(category, kept);
    }
  }
  const allowedNames = new Set<string>();
  for (const categoryTools of filteredByCategory.values()) {
    for (const tool of categoryTools) {
      allowedNames.add(tool.name);
    }
  }
  const filteredTools = full.tools.filter((tool) => allowedNames.has(tool.name));
  const hasSearchCategory = filteredByCategory.has(ToolCategory.SEARCH);
  return {
    tools: filteredTools,
    toolsByCategory: filteredByCategory,
    bundle,
    flags: {
      hasContextDiscovery:
        full.flags.hasContextDiscovery && allowed.has(ToolCategory.CONTEXT_DISCOVERY),
      hasRulesSearch: full.flags.hasRulesSearch && hasSearchCategory,
      hasBdfTools: full.flags.hasBdfTools && hasSearchCategory,
      hasTavilySearch: full.flags.hasTavilySearch && hasSearchCategory,
      hasDisciplinariPdf: full.flags.hasDisciplinariPdf && hasSearchCategory,
      hasConformityCheck: full.flags.hasConformityCheck && allowed.has(ToolCategory.CONFORMITY),
      hasJobManagement: full.flags.hasJobManagement && allowed.has(ToolCategory.JOB_MANAGEMENT),
    },
  };
}

/**
 * Deterministic bundle selector. Called once at graph creation. Returns DOSAGE
 * when boot context unambiguously indicates a dosage planning thread (jobId
 * present); FULL otherwise. Explicit override via `forcedBundle` for tests.
 */
export function resolveToolBundle(input: {
  readonly jobId?: string;
  readonly forcedBundle?: ToolBundle;
}): ToolBundle {
  if (input.forcedBundle) return input.forcedBundle;
  if (input.jobId) return 'DOSAGE';
  return 'FULL';
}
