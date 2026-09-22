import type { Request, Response } from 'express';
import { ListBdfLabelDatasetPairsUseCase } from '../../../application/use-cases/label/ListBdfLabelDatasetPairsUseCase';
import { CsvBdfLabelDatasetRepository } from '../../repositories/CsvBdfLabelDatasetRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerListBdfLabelPairs(this: LabelControllerContext, _request: Request, response: Response): Promise<Response> {
    const repository = new CsvBdfLabelDatasetRepository();
    const useCase = new ListBdfLabelDatasetPairsUseCase(repository);
    const pairs = await useCase.execute();
    return response.json({ status: 'success', data: pairs });
  }
