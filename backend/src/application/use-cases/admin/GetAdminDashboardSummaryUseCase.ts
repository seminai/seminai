import { AdminDashboardSummaryDTO } from '../../../domain/dtos/admin-dashboard.dto';
import { IAdminRepository } from '../../../domain/repositories/IAdminRepository';

export class GetAdminDashboardSummaryUseCase {
  constructor(private readonly adminRepository: IAdminRepository) {}

  async execute(): Promise<AdminDashboardSummaryDTO> {
    return this.adminRepository.getDashboardSummary();
  }
}
