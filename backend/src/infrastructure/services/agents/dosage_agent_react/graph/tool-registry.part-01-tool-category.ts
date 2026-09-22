import { JobOperationsVectorStore, DisciplinariPdfVectorStore } from '../search-tools';
import type { DosageAgentContext } from '../../dosage_agent/context';
import type { IJobRepository } from '../../../../../domain/repositories/IJobRepository';
import type { IStockRepository } from '../../../../../domain/repositories/IStockRepository';
import { CompanyKind } from '@prisma/client';
import { StructuredTool } from '@langchain/core/tools';
import * as toolFactories from '../tools';

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
export const BUNDLE_CATEGORIES: Record<ToolBundle, ReadonlySet<ToolCategory>> = {
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
export const MANUFACTURING_TOOL_ALLOWLIST: ReadonlySet<string> = new Set<string>([
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

export type AddToolCategory = (category: ToolCategory, tools: StructuredTool[]) => void;

export function addUserScopedTools(
  cfg: ToolRegistryConfig,
  addCategory: AddToolCategory,
): boolean {
  // ── CONTEXT_DISCOVERY (when userId is set) ──
  const hasContextDiscovery = !!cfg.userId;
  if (hasContextDiscovery) {
    addCategory(ToolCategory.CONTEXT_DISCOVERY, [
      toolFactories.createGetWorkingMemoryDetailsTool(cfg.threadId),
      toolFactories.createListUserCompaniesTool(cfg.userId!, cfg.companyKindFilter),
      toolFactories.createListProductionUnitsTool(cfg.threadId, cfg.userId!),
      toolFactories.createListCompanyProductsTool(cfg.threadId, cfg.userId!),
      toolFactories.createScheduleAlertTool(cfg.userId!, cfg.threadId),
      toolFactories.createAskUserQuestionsTool(cfg.threadId, cfg.userId),
    ]);
    if (cfg.jobRepository) {
      addCategory(ToolCategory.CONTEXT_DISCOVERY, [
        toolFactories.createListDoneOperationsTool(cfg.userId!, cfg.jobRepository),
        toolFactories.createListUnverifiedOperationsTool(cfg.userId!, cfg.jobRepository),
      ]);
    }

    addCategory(ToolCategory.FIELD_NOTES, [
      toolFactories.createDelegateToFieldNoteTool(cfg.threadId, cfg.userId!),
      toolFactories.createApproveFieldNoteTool(cfg.threadId, cfg.userId!),
      toolFactories.createRejectFieldNoteTool(cfg.threadId, cfg.userId!),
    ]);

    addCategory(ToolCategory.ENTITY_MANAGEMENT, [
      toolFactories.createCreateCompanyTool(cfg.threadId, cfg.userId!),
      toolFactories.createCreateFieldsTool(cfg.threadId, cfg.userId!),
      toolFactories.createCreateProductionUnitsTool(cfg.threadId, cfg.userId!),
      toolFactories.createUpdateProductionUnitsTool(cfg.threadId, cfg.userId!),
      toolFactories.createListUserFieldsTool(cfg.threadId, cfg.userId!),
      toolFactories.createExtractFromFileTool(cfg.threadId, cfg.userId!),
      toolFactories.createNormalizeExtractionTool(cfg.threadId),
      toolFactories.createPresentExtractionReviewTool({ threadId: cfg.threadId, userId: cfg.userId! }),
      toolFactories.createImportFromFileTool(cfg.threadId, cfg.userId!),
      toolFactories.createImportStockFromFileTool(cfg.threadId, cfg.userId!, cfg.companyKindFilter),
      toolFactories.createCheckExtractionStatusTool(cfg.threadId),
    ]);

    addCategory(ToolCategory.WORKSPACE_RULES, [
      toolFactories.createListUserWorkspacesTool(cfg.userId!),
      toolFactories.createListWorkspaceRulesTool(cfg.userId!),
      toolFactories.createListEffectiveCompanyRulesTool(cfg.userId!),
      toolFactories.createCreateWorkspaceRuleTool(cfg.threadId, cfg.userId!),
      toolFactories.createUpdateWorkspaceRuleTool(cfg.threadId, cfg.userId!),
      toolFactories.createArchiveWorkspaceRuleTool(cfg.userId!),
    ]);

    // ── SALES (anagrafica cliente/fornitore, ordini, DDT con scarico magazzino) ──
    addCategory(ToolCategory.SALES, [
      toolFactories.createCreateBusinessPartnerTool(),
      toolFactories.createSearchBusinessPartnersTool(),
      toolFactories.createCreateSalesOrderTool(),
      toolFactories.createConfirmSalesOrderTool(),
      toolFactories.createListSalesOrdersTool(),
      toolFactories.createCheckProductAvailabilityTool(),
      toolFactories.createPreviewOrderTemplateTool(cfg.threadId),
      toolFactories.createImportSalesOrderFromTemplateTool(cfg.threadId),
      toolFactories.createGenerateProformaTool(),
      toolFactories.createGenerateDdtTool(),
      toolFactories.createCancelDdtTool(),
      toolFactories.createGetDdtTool(),
    ]);
  }

    return hasContextDiscovery;
}
