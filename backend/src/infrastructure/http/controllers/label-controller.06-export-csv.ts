import type { Request, Response } from 'express';
import { isFitoLabel, Label } from '../../../domain/dtos/label.dto';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { serializeCsv, toCsvRows } from '../../utils/labelsCsv';
import * as fs from 'fs';
import * as path from 'path';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerExportCsv(this: LabelControllerContext, _request: Request, response: Response): Promise<Response> {
    const repo = new PrismaLabelExtractionRepository(prisma);
    const all = await repo.listAll();

    const rows = all
      .filter((rec) => isFitoLabel(rec.label))
      .flatMap((rec) =>
        toCsvRows({
          productName: rec.productName,
          registrationNumber: rec.registrationNumber,
          label: rec.label as Label,
        }),
      );
    const csv = serializeCsv(rows);

    const baseDir = path.resolve(process.cwd(), 'extraction', 'label');
    fs.mkdirSync(baseDir, { recursive: true });
    const filename = `labels_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const filePath = path.join(baseDir, filename);
    fs.writeFileSync(filePath, csv, { encoding: 'utf8' });

    return response.json({ status: 'success', data: { filePath } });
  }
