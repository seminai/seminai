import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBdfTools } from './bdf.js';
import { registerCompaniesTools } from './companies.js';
import { registerDisciplinariTools } from './disciplinari.js';
import { registerDosageProposalTools } from './dosage-proposal.js';
import { registerFieldsTools } from './fields.js';
import { registerLabelsTools } from './labels.js';
import { registerMachinesTools } from './machines.js';
import { registerProductionUnitsTools } from './production-units.js';
import { registerQdcLicenseReadTools } from './qdc/read-license.js';
import { registerQdcOperationsReadTools } from './qdc/read-operations.js';
import { registerQdcWarehouseReadTools } from './qdc/read-warehouse.js';
import { registerQdcWriteTools } from './qdc/writes.js';
import { registerStockJobsTools } from './stock-jobs.js';
import { registerWarehousesTools } from './warehouses.js';
import { registerWorkspacesTools } from './workspaces.js';
import type { ToolDependencies } from './types.js';

export type { ToolDependencies } from './types.js';

const REGISTRARS = [
  registerCompaniesTools,
  registerWorkspacesTools,
  registerFieldsTools,
  registerProductionUnitsTools,
  registerMachinesTools,
  registerWarehousesTools,
  registerBdfTools,
  registerLabelsTools,
  registerStockJobsTools,
  registerDisciplinariTools,
  registerDosageProposalTools,
  registerQdcLicenseReadTools,
  registerQdcOperationsReadTools,
  registerQdcWarehouseReadTools,
  registerQdcWriteTools,
] as const;

export function registerAllTools(server: McpServer, deps: ToolDependencies): void {
  for (const register of REGISTRARS) {
    register(server, deps);
  }
}
