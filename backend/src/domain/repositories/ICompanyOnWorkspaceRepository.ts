import { CompanyOnWorkspace } from '../entities/CompanyOnWorkspace';
import { Company } from '../entities/Company';

export interface WorkspaceCompanyAssignmentDTO {
  readonly companyId: string;
  readonly companyName: string;
  readonly companyKind: Company['kind'];
  readonly assignedAt: Date;
}

export interface ICompanyOnWorkspaceRepository {
  createMany(assignments: CompanyOnWorkspace[]): Promise<void>;
  findCompanyIdsByWorkspaceId(workspaceId: string): Promise<string[]>;
  findAssignmentsWithCompanies(workspaceId: string): Promise<WorkspaceCompanyAssignmentDTO[]>;
  replaceAssignments(
    workspaceId: string,
    companyIds: readonly string[],
    assignedById: string,
  ): Promise<void>;
  assignCompany(
    workspaceId: string,
    companyId: string,
    assignedById: string,
  ): Promise<CompanyOnWorkspace>;
}
