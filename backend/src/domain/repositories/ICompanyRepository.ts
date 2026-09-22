import { Company } from '../entities/Company';

export interface ICompanyRepository {
  create(company: Company): Promise<Company>;
  createMany(companies: Company[]): Promise<void>;
  findById(id: string): Promise<Company | null>;
  findManyByUserId(userId: string): Promise<Company[]>;
  findByVatNumber(vatNumber: string): Promise<Company | null>;
  findByFiscalCode(fiscalCode: string): Promise<Company | null>;
  update(id: string, company: Partial<Company>): Promise<Company>;
  updateMany(updates: Array<{ id: string; data: Partial<Company> }>): Promise<number>;
  /** Reads the courier summary recipient email (Phase 4). */
  getCourierEmail(companyId: string): Promise<string | null>;
  /** Sets the courier summary recipient email (Phase 4). */
  setCourierEmail(companyId: string, courierEmail: string | null): Promise<void>;
  delete(id: string): Promise<void>;
  deleteWithAllData(id: string): Promise<void>;
}
