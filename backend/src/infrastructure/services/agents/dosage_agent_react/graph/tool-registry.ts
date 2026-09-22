/**
 * Tool registration for the Dosage ReAct Agent.
 * Builds the complete list of tools and derived capability flags
 * based on available configuration (userId, BDF credentials, etc.).
 *
 * Tools are organized by category for clearer prompt generation and maintenance.
 */
import { StructuredTool } from '@langchain/core/tools';
import { CompanyKind } from '@prisma/client';
import type { IJobRepository } from '../../../../../domain/repositories/IJobRepository';
import type { IStockRepository } from '../../../../../domain/repositories/IStockRepository';
import {
  createCheckRevokedTool,
  createExpandCyclesTool,
  createExtractBufferZonesTool,
  createEnrichBdfTool,
  createCalculateStockTool,
  createSearchProductsTool,
  createCalculateDosageTool,
  createValidateComplianceTool,
  createValidateSAGroupsTool,
  createValidateAgronomicPlanTool,
  createCheckCompatibilityTool,
  createPlanStrategyTool,
  createOptimizeDosageTool,
  createCreateJobsTool,
  createFertilizerPlanTool,
  createGeneratePlanTool,
  createModifyPlanStepTool,
  createExecutePlanTool,
  createSpawnSubagentTool,
  createListExistingJobGroupsTool,
  createListUserCompaniesTool,
  createListProductionUnitsTool,
  createListCompanyProductsTool,
  createScheduleAlertTool,
  createAskUserQuestionsTool,
  createGetWorkingMemoryDetailsTool,
  createListDoneOperationsTool,
  createListUnverifiedOperationsTool,
  createDelegateToFieldNoteTool,
  createApproveFieldNoteTool,
  createRejectFieldNoteTool,
  createSearchProductLabelDatabaseTool,
  createDiagnoseFromPhotoTool,
  createRecommendBestProductsTool,
  createCreateCompanyTool,
  createCreateFieldsTool,
  createCreateProductionUnitsTool,
  createUpdateProductionUnitsTool,
  createListUserFieldsTool,
  createExtractFromFileTool,
  createNormalizeExtractionTool,
  createPresentExtractionReviewTool,
  createImportFromFileTool,
  createImportStockFromFileTool,
  createCheckExtractionStatusTool,
  createListUserWorkspacesTool,
  createListWorkspaceRulesTool,
  createListEffectiveCompanyRulesTool,
  createCreateWorkspaceRuleTool,
  createUpdateWorkspaceRuleTool,
  createArchiveWorkspaceRuleTool,
  // Conformity tools
  createRunConformityCheckTool,
  createConfirmConformityCheckTool,
  // Job management tools
  createUpdateJobTool,
  createAddJobTool,
  createMergeTreatmentDatesTool,
  createOptimizeSelectedJobsTool,
  // Stock & authorization tools
  createSearchCompanyStockTool,
  createCheckProductCropAuthorizationsTool,
  // Task planner + tool wrapper
  createPlanTaskTool,
  wrapToolWithReminder,
  // Dosage agent full-pipeline launcher
  createStartDosageAgentJobTool,
  // Open-Meteo weather tools
  createGetWeatherForecastTool,
  createEvaluateTreatmentWindowTool,
  // Embedded form-editor chat tools
  createProposeSetUnitFieldsTool,
  createProposeAddUnitTool,
  createProposeRemoveUnitTool,
  createProposeMoveAllocationTool,
  // Sales module tools
  createCreateBusinessPartnerTool,
  createSearchBusinessPartnersTool,
  createCreateSalesOrderTool,
  createConfirmSalesOrderTool,
  createListSalesOrdersTool,
  createCheckProductAvailabilityTool,
  createPreviewOrderTemplateTool,
  createImportSalesOrderFromTemplateTool,
  createGenerateProformaTool,
  createGenerateDdtTool,
  createCancelDdtTool,
  createGetDdtTool,
  createQdcListCompaniesTool,
  createQdcGetOperationsTool,
  createQdcGetGiacenzeTool,
} from '../tools';
import { wrapToolWithDurableTask } from './durable-execution';
import { wrapToolWithRetry } from '../tools/retry-wrapper';
import { wrapToolWithArgumentValidator } from '../tools/argument-validator';
import { wrapToolWithAnalytics } from '../tools/analytics-wrapper';
import {
  createTavilyScientificSearchTool,
  createRulesSearchTool,
  createDisciplinariDatabaseSearchTool,
  createDisciplinariPdfSearchTool,
  createCachedBdfClient,
  createBdfSearchProductDosesTool,
  createBdfSearchProductsByAdversityTool,
  JobOperationsVectorStore,
  DisciplinariPdfVectorStore,
} from '../search-tools';
import { createJobOperationsSearchTool } from '../../chat_dosage_agent/tools';
import type { DosageAgentContext } from '../../dosage_agent/context';

// ── Tool Categories ──

export enum ToolCategory {
  DOSAGE_PIPELINE = 'DOSAGE_PIPELINE',
  PLANNING = 'PLANNING',
  CONFORMITY = 'CONFORMITY',
  JOB_MANAGEMENT = 'JOB_MANAGEMENT',
  CONTEXT_DISCOVERY = 'CONTEXT_DISCOVERY',
  SEARCH = 'SEARCH',
  ENTITY_MANAGEMENT = 'ENTITY_MANAGEMENT',
  FIELD_NOTES = 'FIELD_NOTES',
  WORKSPACE_RULES = 'WORKSPACE_RULES',
  STOCK = 'STOCK',
  WEATHER = 'WEATHER',
  QDC = 'QDC',
  FORM_EDITOR = 'FORM_EDITOR',
  SALES = 'SALES',
}

// ── Intent Bundles ──

/**
 * Stable bundles activated once per thread, NOT per message. Keeping the
 * tool set fixed for the lifetime of a thread keeps the OpenAI prompt-cache
 * prefix stable across turns. Choose narrower bundles only when the intent
 * is unambiguous from boot context (e.g. jobId present → DOSAGE).
 */
export type ToolBundle = 'DOSAGE' | 'FULL' | 'MANUFACTURING';

/** Categories included in each bundle. Categories not in the map are excluded. */
const BUNDLE_CATEGORIES: Record<ToolBundle, ReadonlySet<ToolCategory>> = {
  DOSAGE: new Set([
    ToolCategory.DOSAGE_PIPELINE,
    ToolCategory.PLANNING,
    ToolCategory.SEARCH,
    ToolCategory.CONTEXT_DISCOVERY,
    ToolCategory.CONFORMITY,
    ToolCategory.JOB_MANAGEMENT,
    ToolCategory.STOCK,
    ToolCategory.WORKSPACE_RULES,
    ToolCategory.QDC,
  ]),
  FULL: new Set<ToolCategory>(Object.values(ToolCategory)),
  // Manufacturing draws from these categories, then a name-level allowlist
  // (MANUFACTURING_TOOL_ALLOWLIST) removes the agronomic tools they also contain.
  MANUFACTURING: new Set([
    ToolCategory.CONTEXT_DISCOVERY,
    ToolCategory.ENTITY_MANAGEMENT,
    ToolCategory.STOCK,
  ]),
};

/**
 * Exact tools exposed to a manufacturing workspace. The three source categories
 * mix allowed + agronomic tools (e.g. CONTEXT_DISCOVERY also has
 * list_production_units), so the bundle is narrowed by name. This mirrors the
 * manufacturing archive perimeter (company + warehouse/stock + document import).
 */
const MANUFACTURING_TOOL_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  'list_user_companies',
  'list_company_products',
  'get_working_memory_details',
  'ask_user_questions',
  'extract_from_file',
  'present_extraction_review',
  'import_stock_from_file',
  'check_extraction_status',
  'search_company_stock_products',
]);

// ── Config & Flags ──

export interface ToolRegistryConfig {
  readonly threadId: string;
  readonly chatId?: string;
  readonly userId?: string;
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly tavilyApiKey?: string;
  readonly jobOperationsVectorStore?: JobOperationsVectorStore;
  readonly disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  readonly context?: DosageAgentContext;
  readonly userInfo?: { name: string; email: string };
  readonly jobRepository?: IJobRepository;
  readonly stockRepository?: IStockRepository;
  /**
   * Client-driven context carried from the FE (e.g. embedded form-editor mode).
   * When `clientContext.formMode === 'production_units'`, the registry exposes
   * the non-persistent `propose_*` tools used by the in-form chat.
   */
  readonly clientContext?: Record<string, unknown>;
  /**
   * When set, company-listing tools return only companies of this kind. Used by
   * the manufacturing agent to avoid surfacing agricultural companies.
   */
  readonly companyKindFilter?: CompanyKind;
}

export interface ToolFlags {
  readonly hasContextDiscovery: boolean;
  readonly hasRulesSearch: boolean;
  readonly hasBdfTools: boolean;
  readonly hasTavilySearch: boolean;
  readonly hasDisciplinariPdf: boolean;
  readonly hasConformityCheck: boolean;
  readonly hasJobManagement: boolean;
}

// ── Builder ──

export function buildTools(cfg: ToolRegistryConfig): {
  tools: StructuredTool[];
  toolsByCategory: ReadonlyMap<ToolCategory, StructuredTool[]>;
  flags: ToolFlags;
} {
  const categories = new Map<ToolCategory, StructuredTool[]>();
  const addCategory = (cat: ToolCategory, t: StructuredTool[]) => {
    const existing = categories.get(cat) ?? [];
    categories.set(cat, [...existing, ...t]);
  };

  // ── DOSAGE_PIPELINE (always on) ──
  addCategory(ToolCategory.DOSAGE_PIPELINE, [
    createCheckRevokedTool(),
    createExpandCyclesTool(cfg.threadId),
    createExtractBufferZonesTool(cfg.threadId),
    createEnrichBdfTool(),
    createSearchProductsTool(cfg.threadId, cfg.context, cfg.userId),
    createCalculateDosageTool(cfg.threadId, cfg.context, cfg.userId),
    createValidateComplianceTool(cfg.threadId, cfg.context, cfg.userId),
    createValidateSAGroupsTool(cfg.threadId, cfg.context),
    createValidateAgronomicPlanTool(cfg.threadId, cfg.userId),
    createCheckCompatibilityTool(cfg.threadId, cfg.context),
    createPlanStrategyTool(cfg.threadId, cfg.context),
    createCalculateStockTool(cfg.threadId),
    createOptimizeDosageTool(cfg.threadId),
    createCreateJobsTool(cfg.threadId, cfg.userId),
    createFertilizerPlanTool(cfg.threadId),
    createSearchProductLabelDatabaseTool(cfg.threadId),
    createDiagnoseFromPhotoTool(cfg.threadId, cfg.userId),
  ]);

  // ── PLANNING (always on) ──
  const planningTools: StructuredTool[] = [
    createGeneratePlanTool(cfg.threadId),
    createModifyPlanStepTool(cfg.threadId),
  ];
  if (cfg.chatId) {
    planningTools.push(createPlanTaskTool(cfg.threadId, cfg.chatId));
  }
  if (cfg.userId) {
    planningTools.push(createListExistingJobGroupsTool(cfg.userId));
    planningTools.push(createStartDosageAgentJobTool(cfg.threadId, cfg.userId));
    planningTools.push(createExecutePlanTool(cfg.threadId, cfg.userId));
    planningTools.push(createSpawnSubagentTool(cfg.threadId, cfg.userId));
  }
  addCategory(ToolCategory.PLANNING, planningTools);

  // ── CONTEXT_DISCOVERY (when userId is set) ──
  const hasContextDiscovery = !!cfg.userId;
  if (hasContextDiscovery) {
    addCategory(ToolCategory.CONTEXT_DISCOVERY, [
      createGetWorkingMemoryDetailsTool(cfg.threadId),
      createListUserCompaniesTool(cfg.userId!, cfg.companyKindFilter),
      createListProductionUnitsTool(cfg.threadId, cfg.userId!),
      createListCompanyProductsTool(cfg.threadId, cfg.userId!),
      createScheduleAlertTool(cfg.userId!, cfg.threadId),
      createAskUserQuestionsTool(cfg.threadId, cfg.userId),
    ]);
    if (cfg.jobRepository) {
      addCategory(ToolCategory.CONTEXT_DISCOVERY, [
        createListDoneOperationsTool(cfg.userId!, cfg.jobRepository),
        createListUnverifiedOperationsTool(cfg.userId!, cfg.jobRepository),
      ]);
    }

    addCategory(ToolCategory.FIELD_NOTES, [
      createDelegateToFieldNoteTool(cfg.threadId, cfg.userId!),
      createApproveFieldNoteTool(cfg.threadId, cfg.userId!),
      createRejectFieldNoteTool(cfg.threadId, cfg.userId!),
    ]);

    addCategory(ToolCategory.ENTITY_MANAGEMENT, [
      createCreateCompanyTool(cfg.threadId, cfg.userId!),
      createCreateFieldsTool(cfg.threadId, cfg.userId!),
      createCreateProductionUnitsTool(cfg.threadId, cfg.userId!),
      createUpdateProductionUnitsTool(cfg.threadId, cfg.userId!),
      createListUserFieldsTool(cfg.threadId, cfg.userId!),
      createExtractFromFileTool(cfg.threadId, cfg.userId!),
      createNormalizeExtractionTool(cfg.threadId),
      createPresentExtractionReviewTool({ threadId: cfg.threadId, userId: cfg.userId! }),
      createImportFromFileTool(cfg.threadId, cfg.userId!),
      createImportStockFromFileTool(cfg.threadId, cfg.userId!, cfg.companyKindFilter),
      createCheckExtractionStatusTool(cfg.threadId),
    ]);

    addCategory(ToolCategory.WORKSPACE_RULES, [
      createListUserWorkspacesTool(cfg.userId!),
      createListWorkspaceRulesTool(cfg.userId!),
      createListEffectiveCompanyRulesTool(cfg.userId!),
      createCreateWorkspaceRuleTool(cfg.threadId, cfg.userId!),
      createUpdateWorkspaceRuleTool(cfg.threadId, cfg.userId!),
      createArchiveWorkspaceRuleTool(cfg.userId!),
    ]);

    // ── SALES (anagrafica cliente/fornitore, ordini, DDT con scarico magazzino) ──
    addCategory(ToolCategory.SALES, [
      createCreateBusinessPartnerTool(),
      createSearchBusinessPartnersTool(),
      createCreateSalesOrderTool(),
      createConfirmSalesOrderTool(),
      createListSalesOrdersTool(),
      createCheckProductAvailabilityTool(),
      createPreviewOrderTemplateTool(cfg.threadId),
      createImportSalesOrderFromTemplateTool(cfg.threadId),
      createGenerateProformaTool(),
      createGenerateDdtTool(),
      createCancelDdtTool(),
      createGetDdtTool(),
    ]);
  }

  // ── CONFORMITY (when context has userId) ──
  const hasConformityCheck = !!cfg.context?.userId;
  if (hasConformityCheck) {
    addCategory(ToolCategory.CONFORMITY, [
      createRunConformityCheckTool(cfg.threadId, cfg.context),
      createConfirmConformityCheckTool(cfg.threadId),
    ]);
  }

  // ── JOB_MANAGEMENT (when userId + userInfo + repositories are available) ──
  const hasJobManagement = !!(
    cfg.userId &&
    cfg.userInfo &&
    cfg.jobRepository &&
    cfg.stockRepository
  );
  if (hasJobManagement) {
    const modOpts = {
      userId: cfg.userId!,
      userInfo: cfg.userInfo!,
      jobRepository: cfg.jobRepository!,
      stockRepository: cfg.stockRepository!,
    };
    addCategory(ToolCategory.JOB_MANAGEMENT, [
      createUpdateJobTool(modOpts),
      createAddJobTool(modOpts),
      createMergeTreatmentDatesTool(modOpts),
      createOptimizeSelectedJobsTool({
        userId: cfg.userId!,
        jobRepository: cfg.jobRepository!,
        stockRepository: cfg.stockRepository!,
      }),
    ]);
  }

  // ── STOCK (when userId is set — complementary to list_company_products) ──
  if (cfg.userId) {
    addCategory(ToolCategory.STOCK, [
      createSearchCompanyStockTool(cfg.userId),
      createCheckProductCropAuthorizationsTool(),
    ]);
  }

  // ── WEATHER (when userId is set; tools self-gate on Settings.openMeteoEnabled at runtime) ──
  if (cfg.userId) {
    addCategory(ToolCategory.WEATHER, [
      createGetWeatherForecastTool(cfg.userId),
      createEvaluateTreatmentWindowTool(cfg.userId),
    ]);
  }

  // ── QDC (when userId is set; tools self-gate on Settings.qdcApiKey at runtime) ──
  if (cfg.userId) {
    addCategory(ToolCategory.QDC, [
      createQdcListCompaniesTool(cfg.userId),
      createQdcGetOperationsTool(cfg.userId),
      createQdcGetGiacenzeTool(cfg.userId),
    ]);
  }

  // ── SEARCH tools (various guards) ──
  const hasRulesSearch = !!(cfg.jobId || cfg.workspaceId || cfg.userId);
  if (hasRulesSearch) {
    addCategory(ToolCategory.SEARCH, [
      createRulesSearchTool({ jobId: cfg.jobId, workspaceId: cfg.workspaceId, userId: cfg.userId }),
    ]);
  }

  addCategory(ToolCategory.SEARCH, [createDisciplinariDatabaseSearchTool()]);

  const bdfBaseUrl = process.env.URL_SERVER_BDF;
  const hasBdfTools = !!(bdfBaseUrl && process.env.USERNAME_BDF && process.env.PASSWORD_BDF);
  if (hasBdfTools) {
    const bdfClient = createCachedBdfClient();
    addCategory(ToolCategory.SEARCH, [
      createBdfSearchProductDosesTool(bdfClient),
      createBdfSearchProductsByAdversityTool(bdfClient),
      createRecommendBestProductsTool(cfg.threadId, cfg.userId),
    ]);
  }

  const hasTavilySearch = !!cfg.tavilyApiKey;
  if (hasTavilySearch) {
    addCategory(ToolCategory.SEARCH, [
      createTavilyScientificSearchTool(cfg.tavilyApiKey, cfg.jobId),
    ]);
  }

  const hasDisciplinariPdf = !!cfg.disciplinariPdfVectorStore;
  if (hasDisciplinariPdf) {
    addCategory(ToolCategory.SEARCH, [
      createDisciplinariPdfSearchTool(cfg.disciplinariPdfVectorStore!),
    ]);
  }

  if (cfg.jobOperationsVectorStore?.hasDocuments()) {
    addCategory(ToolCategory.SEARCH, [createJobOperationsSearchTool(cfg.jobOperationsVectorStore)]);
  }

  // ── FORM_EDITOR (only when client signals an embedded form-editor chat) ──
  if (cfg.clientContext?.formMode === 'production_units') {
    addCategory(ToolCategory.FORM_EDITOR, [
      createProposeSetUnitFieldsTool(cfg.threadId),
      createProposeAddUnitTool(cfg.threadId),
      createProposeRemoveUnitTool(cfg.threadId),
      createProposeMoveAllocationTool(cfg.threadId),
    ]);
  }

  // Flatten all categories into a single tools array, applying wrappers.
  // Order (innermost → outermost): durable → validator → retry → reminder → analytics
  const analyticsCtx = {
    userId: cfg.userId,
    companyId: cfg.context?.companyId,
    workspaceId: cfg.workspaceId,
  };
  const tools: StructuredTool[] = [];
  for (const categoryTools of categories.values()) {
    for (const tool of categoryTools) {
      const durable = wrapToolWithDurableTask(
        tool as import('@langchain/core/tools').DynamicStructuredTool,
      );
      const validated = wrapToolWithArgumentValidator(durable);
      const retried = wrapToolWithRetry(validated);
      const reminded = wrapToolWithReminder(retried);
      tools.push(wrapToolWithAnalytics(reminded, analyticsCtx));
    }
  }

  return {
    tools,
    toolsByCategory: categories,
    flags: {
      hasContextDiscovery,
      hasRulesSearch,
      hasBdfTools,
      hasTavilySearch,
      hasDisciplinariPdf,
      hasConformityCheck,
      hasJobManagement,
    },
  };
}

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
