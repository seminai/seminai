/**
 * Tool registry for the Dosage ReAct Agent.
 * Exports all tool creation functions.
 */

// Computation tools (wrapping dosage_agent)
export { createCheckRevokedTool } from './check-revoked.tool';
export { createExpandCyclesTool } from './expand-cycles.tool';
export { createExtractBufferZonesTool } from './extract-buffer-zones.tool';
export { createEnrichBdfTool } from './enrich-bdf.tool';
export { createCalculateStockTool } from './calculate-stock.tool';
export { createSearchProductsTool } from './search-products.tool';
export { createCalculateDosageTool } from './calculate-dosage.tool';
export { createValidateComplianceTool } from './validate-compliance.tool';
export { createValidateSAGroupsTool } from './validate-sa-groups.tool';
export { createValidateAgronomicPlanTool } from './validate-agronomic-plan.tool';
export { createCheckCompatibilityTool } from './check-compatibility.tool';
export { createPlanStrategyTool } from './plan-strategy.tool';
export { createOptimizeDosageTool } from './optimize-dosage.tool';
export { createCreateJobsTool, DESTRUCTIVE_TOOLS } from './create-jobs.tool';
export { createFertilizerPlanTool } from './fertilizer-plan.tool';

// Planning tools
export { createGeneratePlanTool } from './generate-plan.tool';
export { createModifyPlanStepTool } from './modify-plan.tool';
export { createExecutePlanTool } from './execute-plan.tool';
export { createListExistingJobGroupsTool } from './list-existing-job-groups.tool';

// Dosage agent full-pipeline launcher
export { createStartDosageAgentJobTool } from './start-dosage-agent-job.tool';

// Questionnaire tool
export { createAskUserQuestionsTool } from './ask-user-questions.tool';

// Context discovery tools
export { createListUserCompaniesTool } from './list-user-companies.tool';
export { createListProductionUnitsTool } from './list-production-units.tool';
export { createListCompanyProductsTool } from './list-company-products.tool';
export { createScheduleAlertTool } from './schedule-alert.tool';
export { createGetWorkingMemoryDetailsTool } from './get-working-memory-details.tool';
export { createListDoneOperationsTool } from './operations-history/list-done-operations.tool';
export { createListUnverifiedOperationsTool } from './operations-history/list-unverified-operations.tool';

// Field note delegation tools
export {
  createDelegateToFieldNoteTool,
  createApproveFieldNoteTool,
  createRejectFieldNoteTool,
} from './delegate-field-note.tool';

// Product label database search
export { createSearchProductLabelDatabaseTool } from './search-product-label-db.tool';
export { createSpawnSubagentTool } from './spawn-subagent.tool';

// Diagnosis + product recommendation
export { createDiagnoseFromPhotoTool } from './diagnose-from-photo.tool';
export { createRecommendBestProductsTool } from './recommend-best-products.tool';

// Entity creation tools
export { createCreateCompanyTool } from './create-company.tool';
export { createCreateFieldsTool } from './create-fields.tool';
export { createCreateProductionUnitsTool } from './create-production-units.tool';
export { createUpdateProductionUnitsTool } from './update-production-units.tool';
export { createListUserFieldsTool } from './list-user-fields.tool';
export { createExtractFromFileTool } from './extract-from-file.tool';
export { createNormalizeExtractionTool } from './normalize-extraction.tool';
export { createPresentExtractionReviewTool } from './present-extraction-review.tool';
export { createImportFromFileTool } from './import-from-file.tool';
export { createImportStockFromFileTool } from './import-stock-from-file.tool';
export { createCheckExtractionStatusTool } from './check-extraction-status.tool';

// Workspace rules management tools
export { createListUserWorkspacesTool } from './list-user-workspaces.tool';
export { createListWorkspaceRulesTool } from './list-workspace-rules.tool';
export { createListEffectiveCompanyRulesTool } from './list-effective-company-rules.tool';
export { createCreateWorkspaceRuleTool } from './create-workspace-rule.tool';
export { createUpdateWorkspaceRuleTool } from './update-workspace-rule.tool';
export { createArchiveWorkspaceRuleTool } from './archive-workspace-rule.tool';

// Conformity check tools (wrapping conformity_checker_agent)
export { createRunConformityCheckTool, createConfirmConformityCheckTool } from './conformity';

// Job management tools (ported from chat_dosage_agent)
export {
  createUpdateJobTool,
  createAddJobTool,
  createMergeTreatmentDatesTool,
  createOptimizeSelectedJobsTool,
} from './job-management';
export type { JobModificationToolOptions, JobOptimizationToolOptions } from './job-management';

// Stock & product authorization tools (ported from chat_dosage_agent)
export { createSearchCompanyStockTool, createCheckProductCropAuthorizationsTool } from './stock';

// Task planner tool (TodoWrite-equivalent)
export { createPlanTaskTool, loadTasksFromDb, formatTaskReminder } from './task-planner.tool';

// Tool result instruction injection wrapper
export { wrapToolWithReminder, wrapToolsWithReminders } from './tool-result-wrapper';

// Open-Meteo weather tools (gated by Settings.openMeteoEnabled at runtime)
export { createGetWeatherForecastTool } from './weather/get-weather-forecast.tool';

// QDC (Quaderno di Campagna) tools (gated by Settings.qdcApiKey at runtime)
export { createQdcListCompaniesTool } from './qdc/qdc-list-companies.tool';
export { createQdcGetOperationsTool } from './qdc/qdc-get-operations.tool';
export { createQdcGetGiacenzeTool } from './qdc/qdc-get-giacenze.tool';

// Embedded form-editor chat tools (only registered when clientContext.formMode is set)
export { createProposeSetUnitFieldsTool } from './propose-set-unit-fields.tool';
export { createProposeAddUnitTool } from './propose-add-unit.tool';
export { createProposeRemoveUnitTool } from './propose-remove-unit.tool';
export { createProposeMoveAllocationTool } from './propose-move-allocation.tool';
export { createEvaluateTreatmentWindowTool } from './weather/evaluate-treatment-window.tool';

// Sales module tools (anagrafica cliente/fornitore, ordini, DDT con scarico magazzino)
export {
  createCreateBusinessPartnerTool,
  createSearchBusinessPartnersTool,
} from './sales-partner.tools';
export {
  createCreateSalesOrderTool,
  createConfirmSalesOrderTool,
  createListSalesOrdersTool,
  createCheckProductAvailabilityTool,
  createPreviewOrderTemplateTool,
  createImportSalesOrderFromTemplateTool,
} from './sales-order.tools';
export { createGenerateDdtTool, createCancelDdtTool, createGetDdtTool } from './sales-ddt.tools';
export { createGenerateProformaTool } from './sales-proforma.tools';
