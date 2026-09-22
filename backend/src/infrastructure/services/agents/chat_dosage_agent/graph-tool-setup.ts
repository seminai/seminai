import { createTavilyScientificSearchTool, createJobDetailsTool, createDisciplinariDatabaseSearchTool, createJobOperationsSearchTool, createRulesSearchTool } from './tools';
import { createUpdateJobTool, createAddJobTool } from './tools-job-modification';
import { createOptimizeSelectedJobsTool } from './tools-job-optimization';
import { createMergeTreatmentDatesTool } from './tools-job-merge';
import { createDisciplinariPdfSearchTool } from './tools-disciplinari-bdf';
import { createSearchCompanyStockTool, createListProductionUnitsTool } from './tools-stock-production';
import { createCheckProductCropAuthorizationsTool } from './tools-product-labels';
import { createSearchProductsTool, createCalculateDosageTool, createValidateComplianceTool, createOptimizeDosageTool, createCreateJobsTool } from '../dosage_agent_react/tools';
import type { DosageAgentContext } from '../dosage_agent/context';
import { createCachedBdfClient, createBdfSearchProductDosesTool, createBdfSearchProductsByAdversityTool } from '../../integrations/bdf';
import { StructuredTool } from '@langchain/core/tools';
import type { AgentGraphFactoryContext } from './graph.context';

export function buildChatDosageGraphTools(this: AgentGraphFactoryContext) {
  // 1. Define Tools
  const tavilyTool = createTavilyScientificSearchTool(this.tavilyApiKey, this.jobId);
  const disciplinariDbTool = createDisciplinariDatabaseSearchTool();
  const tools: StructuredTool[] = [];

  // Priority tool for vectorized rules (company-assigned + workspace-level)
  const hasRulesContext = this.jobId || this.workspaceId || this.userId;
  if (hasRulesContext) {
    const rulesSearchTool = createRulesSearchTool({
      jobId: this.jobId,
      workspaceId: this.workspaceId,
      userId: this.userId,
    });
    tools.push(rulesSearchTool);
  }
  tools.push(disciplinariDbTool, tavilyTool);

  // BDF official database tools (if credentials available)
  const bdfBaseUrl = process.env.URL_SERVER_BDF;
  const bdfUsername = process.env.USERNAME_BDF;
  const bdfPassword = process.env.PASSWORD_BDF;
  if (bdfBaseUrl && bdfUsername && bdfPassword) {
    const bdfClient = createCachedBdfClient();
    tools.push(
      createBdfSearchProductDosesTool(bdfClient),
      createBdfSearchProductsByAdversityTool(bdfClient),
    );
  }

  // Add job details tool if userId is provided
  if (this.userId) {
    const jobTool = createJobDetailsTool(this.userId);
    tools.push(jobTool);
  }

  // Add job operations search tool if vector store is available
  if (this.jobOperationsVectorStore && this.jobOperationsVectorStore.hasDocuments()) {
    const jobOpsSearchTool = createJobOperationsSearchTool(this.jobOperationsVectorStore);
    tools.push(jobOpsSearchTool);
    console.log(
      `[AgentGraphFactory] Added search_job_operations tool with ${this.jobOperationsVectorStore.getStats()?.totalOperations ?? 0} indexed operations`,
    );
  }

  // Add disciplinari PDF search tool if vector store is provided
  if (this.disciplinariPdfVectorStore) {
    const disciplinariPdfTool = createDisciplinariPdfSearchTool(this.disciplinariPdfVectorStore);
    tools.push(disciplinariPdfTool);
    console.log('[AgentGraphFactory] Added search_disciplinari_bdf_pdf tool');
  }

  // Add job modification tools if userId, userInfo, and repositories are available
  const canModifyJobs =
    this.userId && this.userInfo && this.jobRepository && this.stockRepository;
  if (canModifyJobs) {
    const modificationOptions = {
      userId: this.userId!,
      userInfo: this.userInfo!,
      jobRepository: this.jobRepository!,
      stockRepository: this.stockRepository!,
    };
    tools.push(createUpdateJobTool(modificationOptions));
    tools.push(createAddJobTool(modificationOptions));
    tools.push(
      createOptimizeSelectedJobsTool({
        userId: this.userId!,
        jobRepository: this.jobRepository!,
        stockRepository: this.stockRepository!,
      }),
    );
    tools.push(createMergeTreatmentDatesTool(modificationOptions));
    console.log(
      `[AgentGraphFactory] Added update_job, create_job, optimize_selected_jobs, merge_treatment_dates tools (requireApproval=${this.requireApproval})`,
    );
  }

  // Add stock & production unit tools if userId is provided
  if (this.userId) {
    tools.push(createSearchCompanyStockTool(this.userId));
    tools.push(createListProductionUnitsTool(this.userId));
    tools.push(createCheckProductCropAuthorizationsTool());
    console.log(
      '[AgentGraphFactory] Added search_company_stock_products, list_production_units, check_product_crop_authorizations tools',
    );
  }

  // Add dosage pipeline tools when threadId is available (working memory isolation)
  if (this.threadId) {
    const dosageContext: DosageAgentContext | undefined =
      this.jobId && this.userId ? { jobId: this.jobId, userId: this.userId } : undefined;
    tools.push(createSearchProductsTool(this.threadId, dosageContext, this.userId));
    tools.push(createCalculateDosageTool(this.threadId, dosageContext));
    tools.push(createValidateComplianceTool(this.threadId, dosageContext));
    tools.push(createOptimizeDosageTool(this.threadId));
    tools.push(createCreateJobsTool(this.threadId));
    console.log(
      `[AgentGraphFactory] Added dosage pipeline tools (search_products, calculate_dosage, validate_compliance, optimize_dosage, create_treatment_jobs) for threadId=${this.threadId}`,
    );
  }

  const modelWithTools = this.model.bindTools(tools);

  return { tools, canModifyJobs, hasRulesContext, modelWithTools };
}
