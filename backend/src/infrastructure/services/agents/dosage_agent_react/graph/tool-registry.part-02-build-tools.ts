import { StructuredTool } from '@langchain/core/tools';
import * as toolFactories from '../tools';
import { createTavilyScientificSearchTool, createRulesSearchTool, createDisciplinariDatabaseSearchTool, createDisciplinariPdfSearchTool, createCachedBdfClient, createBdfSearchProductDosesTool, createBdfSearchProductsByAdversityTool } from '../search-tools';
import { createJobOperationsSearchTool } from '../../chat_dosage_agent/tools';
import { wrapToolWithDurableTask } from './durable-execution';
import { wrapToolWithArgumentValidator } from '../tools/argument-validator';
import { wrapToolWithRetry } from '../tools/retry-wrapper';
import { wrapToolWithAnalytics } from '../tools/analytics-wrapper';
import { ToolCategory, ToolFlags, ToolRegistryConfig, addUserScopedTools } from './tool-registry.part-01-tool-category';

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
    toolFactories.createCheckRevokedTool(),
    toolFactories.createExpandCyclesTool(cfg.threadId),
    toolFactories.createExtractBufferZonesTool(cfg.threadId),
    toolFactories.createEnrichBdfTool(),
    toolFactories.createSearchProductsTool(cfg.threadId, cfg.context, cfg.userId),
    toolFactories.createCalculateDosageTool(cfg.threadId, cfg.context, cfg.userId),
    toolFactories.createValidateComplianceTool(cfg.threadId, cfg.context, cfg.userId),
    toolFactories.createValidateSAGroupsTool(cfg.threadId, cfg.context),
    toolFactories.createValidateAgronomicPlanTool(cfg.threadId, cfg.userId),
    toolFactories.createCheckCompatibilityTool(cfg.threadId, cfg.context),
    toolFactories.createPlanStrategyTool(cfg.threadId, cfg.context),
    toolFactories.createCalculateStockTool(cfg.threadId),
    toolFactories.createOptimizeDosageTool(cfg.threadId),
    toolFactories.createCreateJobsTool(cfg.threadId, cfg.userId),
    toolFactories.createFertilizerPlanTool(cfg.threadId),
    toolFactories.createSearchProductLabelDatabaseTool(cfg.threadId),
    toolFactories.createDiagnoseFromPhotoTool(cfg.threadId, cfg.userId),
  ]);

  // ── PLANNING (always on) ──
  const planningTools: StructuredTool[] = [
    toolFactories.createGeneratePlanTool(cfg.threadId),
    toolFactories.createModifyPlanStepTool(cfg.threadId),
  ];
  if (cfg.chatId) {
    planningTools.push(toolFactories.createPlanTaskTool(cfg.threadId, cfg.chatId));
  }
  if (cfg.userId) {
    planningTools.push(toolFactories.createListExistingJobGroupsTool(cfg.userId));
    planningTools.push(toolFactories.createStartDosageAgentJobTool(cfg.threadId, cfg.userId));
    planningTools.push(toolFactories.createExecutePlanTool(cfg.threadId, cfg.userId));
    planningTools.push(toolFactories.createSpawnSubagentTool(cfg.threadId, cfg.userId));
  }
  addCategory(ToolCategory.PLANNING, planningTools);

  const hasContextDiscovery = addUserScopedTools(cfg, addCategory);

  // ── CONFORMITY (when context has userId) ──
  const hasConformityCheck = !!cfg.context?.userId;
  if (hasConformityCheck) {
    addCategory(ToolCategory.CONFORMITY, [
      toolFactories.createRunConformityCheckTool(cfg.threadId, cfg.context),
      toolFactories.createConfirmConformityCheckTool(cfg.threadId),
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
      toolFactories.createUpdateJobTool(modOpts),
      toolFactories.createAddJobTool(modOpts),
      toolFactories.createMergeTreatmentDatesTool(modOpts),
      toolFactories.createOptimizeSelectedJobsTool({
        userId: cfg.userId!,
        jobRepository: cfg.jobRepository!,
        stockRepository: cfg.stockRepository!,
      }),
    ]);
  }

  // ── STOCK (when userId is set — complementary to list_company_products) ──
  if (cfg.userId) {
    addCategory(ToolCategory.STOCK, [
      toolFactories.createSearchCompanyStockTool(cfg.userId),
      toolFactories.createCheckProductCropAuthorizationsTool(),
    ]);
  }

  // ── WEATHER (when userId is set; tools self-gate on Settings.openMeteoEnabled at runtime) ──
  if (cfg.userId) {
    addCategory(ToolCategory.WEATHER, [
      toolFactories.createGetWeatherForecastTool(cfg.userId),
      toolFactories.createEvaluateTreatmentWindowTool(cfg.userId),
    ]);
  }

  // ── QDC (when userId is set; tools self-gate on Settings.qdcApiKey at runtime) ──
  if (cfg.userId) {
    addCategory(ToolCategory.QDC, [
      toolFactories.createQdcListCompaniesTool(cfg.userId),
      toolFactories.createQdcGetOperationsTool(cfg.userId),
      toolFactories.createQdcGetGiacenzeTool(cfg.userId),
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
      toolFactories.createRecommendBestProductsTool(cfg.threadId, cfg.userId),
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
      toolFactories.createProposeSetUnitFieldsTool(cfg.threadId),
      toolFactories.createProposeAddUnitTool(cfg.threadId),
      toolFactories.createProposeRemoveUnitTool(cfg.threadId),
      toolFactories.createProposeMoveAllocationTool(cfg.threadId),
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
      const reminded = toolFactories.wrapToolWithReminder(retried);
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
