import { Request, Response } from 'express';
import { ToolController } from '../infrastructure/http/controllers/ToolController';
import {
  ExtractDataFromBrogliaccioService,
  BrogliaccioExtractionResult,
} from '../infrastructure/services/tool/extractDataFromBrogliaccio';
import type { MulterFile } from '../infrastructure/services/Multer';

describe('ToolController brogliaccio extraction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns per-file extraction results with partial failures', async () => {
    const expectedResult: BrogliaccioExtractionResult = {
      rawEntries: [],
      payload: [
        {
          productionUnitName: 'Vigneto Nord',
          dateOfOpeation: '2025-04-10T00:00:00.000Z',
          category: 'TREATMENT',
          quantity: 1.2,
          unitOfMeasureQuantity: 'L',
          treatedSurface: 2.5,
          totalDistributedWaterL: 400,
          stocks: [],
        },
      ],
    };
    jest
      .spyOn(ExtractDataFromBrogliaccioService.prototype, 'execute')
      .mockImplementation(async ({ fileName }) => {
        if (fileName === 'failed.jpg') throw new Error('Unreadable image');
        return expectedResult;
      });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = {
      files: [
        createMulterFile('ok.webp', 'image/webp'),
        createMulterFile('failed.jpg', 'image/jpeg'),
      ],
    } as unknown as Request;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response;

    await new ToolController().extractDataFromBrogliacci(request, response);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      data: {
        results: [
          { fileName: 'ok.webp', status: 'extracted', ...expectedResult },
          {
            fileName: 'failed.jpg',
            status: 'failed',
            error: 'Unreadable image',
            rawEntries: [],
            payload: [],
          },
        ],
      },
    });
  });
});

function createMulterFile(originalname: string, mimetype: string): MulterFile {
  return {
    fieldname: 'files',
    originalname,
    encoding: '7bit',
    mimetype,
    size: 10,
    buffer: Buffer.from('image'),
  };
}
