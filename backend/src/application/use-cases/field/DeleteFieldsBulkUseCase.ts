import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';

export interface DeleteFieldsBulkInput {
  ids: string[];
}

export class DeleteFieldsBulkUseCase {
  constructor(private readonly fieldRepository: IFieldRepository) {}

  async execute(input: DeleteFieldsBulkInput): Promise<void> {
    await this.fieldRepository.deleteMany(input.ids);
  }
}
