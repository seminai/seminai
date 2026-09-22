import { Label } from '../../../domain/dtos/label.dto';
import { ILabelExtractor, ILabelTextProvider } from '../../../domain/repositories/ILabelServices';

export interface ExtractLabelDTO {
  name: string;
  registrationNumber: string;
}

export class ExtractLabelUseCase {
  constructor(
    private readonly textProvider: ILabelTextProvider,
    private readonly extractor: ILabelExtractor,
  ) {}

  async execute({
    name,
    registrationNumber,
  }: ExtractLabelDTO): Promise<{ url: string; data: Label; text: string } | null> {
    const source = await this.textProvider.getText(name, registrationNumber);
    if (!source) return null;
    const data = await this.extractor.extract(source.text);
    return { url: source.url, data, text: source.text };
  }
}
