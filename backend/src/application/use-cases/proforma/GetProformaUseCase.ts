import {
  IProformaInvoiceRepository,
  ProformaInvoiceWithItems,
} from '../../../domain/repositories/IProformaInvoiceRepository';
import { AppError } from '../../../domain/errors/AppError';

/** Fetches a single proforma with its lines, or throws 404. */
export class GetProformaUseCase {
  constructor(private readonly proformaInvoiceRepository: IProformaInvoiceRepository) {}

  async execute(id: string): Promise<ProformaInvoiceWithItems> {
    const found = await this.proformaInvoiceRepository.findById(id);
    if (!found) {
      throw AppError.notFound('Proforma not found', 'PROFORMA_NOT_FOUND');
    }
    return found;
  }
}
