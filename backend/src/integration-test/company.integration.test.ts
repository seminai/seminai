import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../infrastructure/repositories/PrismaCompanyOnWorkspaceRepository';
import { PrismaUserOnCompanyRepository } from '../infrastructure/repositories/PrismaUserOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../infrastructure/repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../infrastructure/repositories/PrismaWorkspaceMemberRepository';
import { CreateCompanyUseCase } from '../application/use-cases/company/CreateCompanyUseCase';
import { prisma } from './setup';
import { createTestUser, deleteTestUser, deleteAllTestCompanies } from './helpers';
import { AppError } from '../domain/errors/AppError';
import { CompanyRole } from '@prisma/client';

describe('Company Integration Tests', () => {
  let companyRepository: PrismaCompanyRepository;
  let userOnCompanyRepository: PrismaUserOnCompanyRepository;
  let createCompanyUseCase: CreateCompanyUseCase;
  let testUserId: string;

  beforeAll(async () => {
    companyRepository = new PrismaCompanyRepository(prisma);
    userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
    const workspaceRepository = new PrismaWorkspaceRepository(prisma);
    const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
    const companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);
    createCompanyUseCase = new CreateCompanyUseCase(
      companyRepository,
      userOnCompanyRepository,
      workspaceRepository,
      workspaceMemberRepository,
      companyOnWorkspaceRepository,
    );

    const testUser = await createTestUser();
    testUserId = testUser.id;
  });

  afterAll(async () => {
    await deleteAllTestCompanies(testUserId);
    await deleteTestUser();
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
  });

  describe('CreateCompanyUseCase', () => {
    it('should create a company successfully', async () => {
      const inputCompanyData = {
        name: 'Test Integration Company',
        vatNumber: '12345678901',
        fiscalCode: 'TSTCMP12A34B567C',
        nation: 'Italia',
        city: 'Roma',
        address: 'Via Test Integration 123',
        cap: '00100',
        email: 'integration@testcompany.it',
        phoneNumber: '+393331234567',
        website: 'https://integrationtest.it',
        logoUrl: 'https://integrationtest.it/logo.png',
        userId: testUserId,
      };

      const actualResult = await createCompanyUseCase.execute(inputCompanyData);

      expect(actualResult).toBeDefined();
      expect(actualResult.company).toBeDefined();
      expect(actualResult.company.name).toBe('Test Integration Company');
      expect(actualResult.company.vatNumber).toBe('12345678901');
      expect(actualResult.userOnCompany).toBeDefined();
      expect(actualResult.userOnCompany.role).toBe(CompanyRole.ADMIN);

      const actualDbCompany = await companyRepository.findById(actualResult.company.id);
      expect(actualDbCompany).toBeDefined();
      expect(actualDbCompany?.name).toBe('Test Integration Company');
    });

    it('should create a company with only name and vatNumber (fiscalCode optional)', async () => {
      const inputMinimalCompany = {
        name: 'Minimal Company',
        vatNumber: '99999999901',
        fiscalCode: null,
        nation: null,
        city: null,
        address: null,
        cap: null,
        email: null,
        phoneNumber: null,
        website: null,
        logoUrl: null,
        userId: testUserId,
      };

      const actualResult = await createCompanyUseCase.execute(inputMinimalCompany);

      expect(actualResult.company.name).toBe('Minimal Company');
      expect(actualResult.company.vatNumber).toBe('99999999901');
      expect(actualResult.company.fiscalCode).toBe('');
      expect(actualResult.userOnCompany.role).toBe(CompanyRole.ADMIN);
    });

    it('should allow multiple companies without fiscalCode without conflict', async () => {
      const inputFirst = {
        name: 'Company A',
        vatNumber: '99999999902',
        fiscalCode: null,
        nation: null,
        city: null,
        address: null,
        cap: null,
        email: null,
        phoneNumber: null,
        website: null,
        logoUrl: null,
        userId: testUserId,
      };
      const inputSecond = { ...inputFirst, name: 'Company B', vatNumber: '99999999903' };

      await createCompanyUseCase.execute(inputFirst);
      const second = await createCompanyUseCase.execute(inputSecond);

      expect(second.company.name).toBe('Company B');
      expect(second.company.fiscalCode).toBe('');
    });

    it('should throw error when VAT number already exists', async () => {
      const inputFirstCompany = {
        name: 'First Company',
        vatNumber: '11111111111',
        fiscalCode: 'FRSCMP11A11A111A',
        nation: 'Italia',
        city: 'Roma',
        address: 'Via First 1',
        cap: '00100',
        email: 'first@company.it',
        phoneNumber: '+393331111111',
        website: 'https://first.it',
        logoUrl: 'https://first.it/logo.png',
        userId: testUserId,
      };

      await createCompanyUseCase.execute(inputFirstCompany);

      const inputDuplicateVatNumber = {
        name: 'Second Company',
        vatNumber: '11111111111',
        fiscalCode: 'SCDCMP22B22B222B',
        nation: 'Italia',
        city: 'Milano',
        address: 'Via Second 2',
        cap: '20100',
        email: 'second@company.it',
        phoneNumber: '+393332222222',
        website: 'https://second.it',
        logoUrl: 'https://second.it/logo.png',
        userId: testUserId,
      };

      await expect(createCompanyUseCase.execute(inputDuplicateVatNumber)).rejects.toThrow(AppError);
      await expect(createCompanyUseCase.execute(inputDuplicateVatNumber)).rejects.toThrow(
        'Company with this VAT number already exists',
      );
    });

    it('should throw error when fiscal code already exists', async () => {
      const inputFirstCompany = {
        name: 'First Company',
        vatNumber: '22222222222',
        fiscalCode: 'UNQCMP11A11A111A',
        nation: 'Italia',
        city: 'Roma',
        address: 'Via First 1',
        cap: '00100',
        email: 'first@company.it',
        phoneNumber: '+393331111111',
        website: 'https://first.it',
        logoUrl: 'https://first.it/logo.png',
        userId: testUserId,
      };

      await createCompanyUseCase.execute(inputFirstCompany);

      const inputDuplicateFiscalCode = {
        name: 'Second Company',
        vatNumber: '33333333333',
        fiscalCode: 'UNQCMP11A11A111A',
        nation: 'Italia',
        city: 'Milano',
        address: 'Via Second 2',
        cap: '20100',
        email: 'second@company.it',
        phoneNumber: '+393332222222',
        website: 'https://second.it',
        logoUrl: 'https://second.it/logo.png',
        userId: testUserId,
      };

      await expect(createCompanyUseCase.execute(inputDuplicateFiscalCode)).rejects.toThrow(
        AppError,
      );
      await expect(createCompanyUseCase.execute(inputDuplicateFiscalCode)).rejects.toThrow(
        'Company with this fiscal code already exists',
      );
    });
  });

  describe('CompanyRepository CRUD Operations', () => {
    it('should find company by id', async () => {
      const inputCompanyData = {
        name: 'Find By ID Company',
        vatNumber: '44444444444',
        fiscalCode: 'FNDCMP44A44A444A',
        nation: 'Italia',
        city: 'Torino',
        address: 'Via Find 4',
        cap: '10100',
        email: 'findbyid@company.it',
        phoneNumber: '+393334444444',
        website: 'https://findbyid.it',
        logoUrl: 'https://findbyid.it/logo.png',
        userId: testUserId,
      };

      const createdCompany = await createCompanyUseCase.execute(inputCompanyData);

      const actualFoundCompany = await companyRepository.findById(createdCompany.company.id);

      expect(actualFoundCompany).toBeDefined();
      expect(actualFoundCompany?.id).toBe(createdCompany.company.id);
      expect(actualFoundCompany?.name).toBe('Find By ID Company');
    });

    it('should update company', async () => {
      const inputCompanyData = {
        name: 'Original Company Name',
        vatNumber: '55555555555',
        fiscalCode: 'UPDCMP55A55A555A',
        nation: 'Italia',
        city: 'Napoli',
        address: 'Via Update 5',
        cap: '80100',
        email: 'update@company.it',
        phoneNumber: '+393335555555',
        website: 'https://update.it',
        logoUrl: 'https://update.it/logo.png',
        userId: testUserId,
      };

      const createdCompany = await createCompanyUseCase.execute(inputCompanyData);

      const inputUpdateData = {
        name: 'Updated Company Name',
        email: 'updated@company.it',
      };

      const actualUpdatedCompany = await companyRepository.update(
        createdCompany.company.id,
        inputUpdateData,
      );

      expect(actualUpdatedCompany).toBeDefined();
      expect(actualUpdatedCompany.name).toBe('Updated Company Name');
      expect(actualUpdatedCompany.email).toBe('updated@company.it');
      expect(actualUpdatedCompany.vatNumber).toBe('55555555555');
    });

    it('should delete company', async () => {
      const inputCompanyData = {
        name: 'Delete Company',
        vatNumber: '66666666666',
        fiscalCode: 'DELCMP66A66A666A',
        nation: 'Italia',
        city: 'Palermo',
        address: 'Via Delete 6',
        cap: '90100',
        email: 'delete@company.it',
        phoneNumber: '+393336666666',
        website: 'https://delete.it',
        logoUrl: 'https://delete.it/logo.png',
        userId: testUserId,
      };

      const createdCompany = await createCompanyUseCase.execute(inputCompanyData);

      await userOnCompanyRepository.deleteByCompanyAndUser(createdCompany.company.id, testUserId);

      await companyRepository.delete(createdCompany.company.id);

      const actualDeletedCompany = await companyRepository.findById(createdCompany.company.id);
      expect(actualDeletedCompany).toBeNull();
    });
  });
});
