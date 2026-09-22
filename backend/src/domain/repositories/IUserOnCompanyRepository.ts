import { UserOnCompany } from '../entities/UserOnCompany';
import { UserOnCompanyWithDetailsDTO, CompanyWithDetailsDTO } from '../dtos/user-on-company.dto';

export interface IUserOnCompanyRepository {
  create(userOnCompany: UserOnCompany): Promise<UserOnCompany>;
  findById(id: string): Promise<UserOnCompany | null>;
  findByCompanyId(companyId: string): Promise<UserOnCompany[]>;
  findByCompanyIdWithDetails(companyId: string): Promise<UserOnCompanyWithDetailsDTO[]>;
  findByUserId(userId: string): Promise<UserOnCompany[]>;
  findByUserIdWithDetails(userId: string): Promise<CompanyWithDetailsDTO[]>;
  findByCompanyAndUser(companyId: string, userId: string): Promise<UserOnCompany | null>;
  update(id: string, userOnCompany: Partial<UserOnCompany>): Promise<UserOnCompany>;
  delete(id: string): Promise<void>;
  deleteByCompanyAndUser(companyId: string, userId: string): Promise<void>;
}
