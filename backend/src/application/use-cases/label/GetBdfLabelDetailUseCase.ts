import {
  BdfLabelDatasetDetail,
  BdfLabelDatasetQuery,
  IBdfLabelDatasetRepository,
} from '../../../domain/repositories/IBdfLabelDatasetRepository';

export class GetBdfLabelDetailUseCase {
  constructor(private readonly repository: IBdfLabelDatasetRepository) {}

  async execute(params: BdfLabelDatasetQuery): Promise<BdfLabelDatasetDetail | null> {
    const normalizedProductName = params.productName.trim();
    const normalizedRegistrationNumber = params.registrationNumber.trim();
    if (!normalizedProductName || !normalizedRegistrationNumber) {
      return null;
    }
    return this.repository.findDetailByProductAndRegistration({
      productName: normalizedProductName,
      registrationNumber: normalizedRegistrationNumber,
    });
  }
}
