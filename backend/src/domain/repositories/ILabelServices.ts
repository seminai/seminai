import { Label, LabelTextResult } from '../dtos/label.dto';

export interface ILabelTextProvider {
  getText(name: string, registrationNumber: string): Promise<LabelTextResult | null>;
}

export interface ILabelExtractor {
  extract(text: string, callbacks?: ReadonlyArray<unknown>): Promise<Label>;
}

export type LabelServices = {
  readonly textProvider: ILabelTextProvider;
  readonly extractor: ILabelExtractor;
};
