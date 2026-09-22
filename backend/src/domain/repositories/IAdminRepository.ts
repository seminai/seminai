import { AdminDashboardSummaryDTO } from '../dtos/admin-dashboard.dto';

export interface IAdminRepository {
  getDashboardSummary(): Promise<AdminDashboardSummaryDTO>;
}
