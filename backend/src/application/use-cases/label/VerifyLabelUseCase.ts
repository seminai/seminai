import {
  ILabelExtractionRepository,
  LabelExtractionRecord,
} from '../../../domain/repositories/ILabelExtractionRepository';

export interface VerifyLabelInput {
  id: string;
  isVerified: boolean;
}

/**
 * Use case per aggiornare lo stato di verifica di un'etichetta.
 */
export class VerifyLabelUseCase {
  constructor(private readonly repository: ILabelExtractionRepository) {}

  async execute(input: VerifyLabelInput): Promise<LabelExtractionRecord | null> {
    return await this.repository.updateVerificationStatus(input.id, input.isVerified);
  }
}
