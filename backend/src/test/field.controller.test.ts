import { Request, Response } from 'express';
import { FieldController } from '../infrastructure/http/controllers/FieldController';
import { IFieldRepository } from '../domain/repositories/IFieldRepository';
import { Field } from '../domain/entities/Field';
import { AppError } from '../domain/errors/AppError';

describe('FieldController', () => {
  let controller: FieldController;
  let mockRepository: jest.Mocked<IFieldRepository>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByCompanyId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IFieldRepository>;

    controller = new FieldController(mockRepository);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('create', () => {
    it('should create a field for authenticated user', async () => {
      const created = Field.create({
        companyId: 'c1',
        name: 'Field A',
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Roma 1',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });

      mockRequest = {
        body: {
          companyId: 'c1',
          name: 'Field A',
          address: 'Via Roma 1',
          sezione: 'S',
          foglio: '10',
          particella: '100',
          superficieCatastaleMq: 100,
        },
        user: { id: 'u1' },
      };

      mockRepository.create.mockResolvedValue(created);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { field: created },
      });
    });
    it('should reject unauthenticated', async () => {
      mockRequest = { body: {}, user: undefined };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
    it('should reject missing required fields', async () => {
      mockRequest = { body: { companyId: 'c1', name: 'X' }, user: { id: 'u1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });
  describe('createBulk', () => {
    it('should create many fields with createMany', async () => {
      mockRequest = {
        body: {
          fields: [
            {
              companyId: 'c1',
              name: 'F1',
              address: 'Addr',
              sezione: 'S',
              foglio: '10',
              particella: '100',
              superficieCatastaleMq: 1,
            },
            {
              companyId: 'c1',
              name: 'F2',
              address: 'Addr2',
              sezione: 'S',
              foglio: '11',
              particella: '101',
              superficieCatastaleMq: 2,
            },
          ],
        },
        user: { id: 'u1' },
      };
      await controller.createBulk(mockRequest as Request, mockResponse as Response);
      expect(mockRepository.createMany).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });
  });
  describe('findById', () => {
    it('should return field when found', async () => {
      const field = Field.create({
        companyId: 'c1',
        name: 'Field A',
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Roma 1',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      mockRequest = { params: { id: 'f1' } };
      mockRepository.findById.mockResolvedValue(field);
      await controller.findById(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', data: { field } });
    });
  });
  describe('update', () => {
    it('should update existing field', async () => {
      const existing = Field.create({
        companyId: 'c1',
        name: 'Field A',
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Roma 1',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      const updated = Field.create({
        companyId: 'c1',
        name: 'Field B',
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 110,
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Roma 2',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      mockRequest = { params: { id: 'f1' }, body: { name: 'Field B', address: 'Via Roma 2' } };
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);
      await controller.update(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { field: updated },
      });
    });
  });
  describe('delete', () => {
    it('should delete existing field', async () => {
      const existing = Field.create({
        companyId: 'c1',
        name: 'Field A',
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Roma 1',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      mockRequest = { params: { id: 'f1' } };
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.delete.mockResolvedValue();
      await controller.delete(mockRequest as Request, mockResponse as Response);
      expect(mockRepository.delete).toHaveBeenCalledWith('f1');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });
});
