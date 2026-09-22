import { Label } from '../dtos/label.dto';

export interface BdfLabelDatasetQuery {
  readonly productName: string;
  readonly registrationNumber: string;
}

export interface BdfLabelDatasetDetail {
  readonly id: string;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly sourceUrl: string;
  readonly label: Label;
  readonly rawText: string;
  readonly extractionConfidence: number;
  readonly extractedFields: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
  readonly qualityExtraction: ReadonlyArray<number>;
  readonly lastUpdate: Date | null;
}

export interface BdfLabelDatasetPair {
  readonly productName: string;
  readonly registrationNumber: string;
}

export interface IBdfLabelDatasetRepository {
  findDetailByProductAndRegistration(
    params: BdfLabelDatasetQuery,
  ): Promise<BdfLabelDatasetDetail | null>;

  listAvailablePairs(): Promise<ReadonlyArray<BdfLabelDatasetPair>>;
}
