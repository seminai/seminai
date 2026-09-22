import {
  ILabelExtractionRepository,
  LabelExtractionRecord,
} from '../../../domain/repositories/ILabelExtractionRepository';

export interface GetLabelByProductAndRegistrationInput {
  productName: string;
  registrationNumber: string;
}

/**
 * Use case per reperire un'etichetta già estratta dato nome prodotto e numero di registrazione.
 */
export class GetLabelByProductAndRegistrationUseCase {
  constructor(private readonly repository: ILabelExtractionRepository) {}

  async execute(
    input: GetLabelByProductAndRegistrationInput,
  ): Promise<LabelExtractionRecord | null> {
    return await this.repository.findByProductAndRegistration({
      productName: input.productName,
      registrationNumber: input.registrationNumber,
    });
  }
}
