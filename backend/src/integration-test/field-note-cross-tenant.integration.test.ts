/**
 * Integration test: cross-tenant authorization gate on field note save
 * (PR-A of P2).
 *
 * Verifies that:
 *   1. saveFieldNote rejects with the authorization error when the caller
 *      tries to write a field note on a fieldId belonging to another tenant.
 *   2. No row is left behind in the FieldNote table after the rejection.
 *   3. executeBulkSaveFieldNotes performs the assert UPFRONT (before opening
 *      the prisma transaction), so a bulk containing even one foreign fieldId
 *      rolls back the entire batch and creates zero rows.
 *
 * Run:
 *   npm run test:int:fast -- --testPathPattern field-note-cross-tenant
 */

import { randomUUID } from 'crypto';
import {
  createTestUser,
  createTestCompany,
  deleteAllTestCompanies,
  deleteTestUser,
  prisma,
} from './helpers';
import type { ITestUser, ITestCompany } from './helpers';
import { saveFieldNote } from '../infrastructure/services/tool/saveFieldNote';
import { executeBulkSaveFieldNotes } from '../infrastructure/services/agents/field_note_agent/toolHelpers';

jest.setTimeout(60_000);

let testUser: ITestUser;
let ownCompany: ITestCompany;
let foreignCompanyId: string;
let ownFieldId: string;
let foreignFieldId: string;

async function createOrphanCompanyWithField(): Promise<{ companyId: string; fieldId: string }> {
  const vat = String(Date.now()).slice(-11);
  const fiscal = (Date.now().toString(36).toUpperCase() + 'OTHR').padEnd(16, 'X').slice(0, 16);
  const company = await prisma.company.create({
    data: {
      name: 'Foreign Tenant SRL',
      vatNumber: vat,
      fiscalCode: fiscal,
      nation: 'Italia',
    },
  });
  const field = await prisma.field.create({
    data: {
      companyId: company.id,
      name: 'Foreign Field',
      coordinates: [],
      coordinatesGaussBoaga: [],
    },
  });
  return { companyId: company.id, fieldId: field.id };
}

beforeAll(async () => {
  testUser = await createTestUser();
  ownCompany = await createTestCompany({
    userId: testUser.id,
    name: 'Own Tenant SRL',
  });
  const ownField = await prisma.field.create({
    data: {
      companyId: ownCompany.id,
      name: 'Own Field',
      coordinates: [],
      coordinatesGaussBoaga: [],
    },
  });
  ownFieldId = ownField.id;
  const foreign = await createOrphanCompanyWithField();
  foreignCompanyId = foreign.companyId;
  foreignFieldId = foreign.fieldId;
});

afterAll(async () => {
  // Cleanup foreign tenant (no UserOnCompany row to drive cascade)
  await prisma.field.deleteMany({ where: { companyId: foreignCompanyId } });
  await prisma.company.delete({ where: { id: foreignCompanyId } }).catch(() => undefined);
  // Cleanup own tenant via standard helper (handles fields, warehouses, etc.)
  await deleteAllTestCompanies(testUser.id);
  await deleteTestUser();
});

describe('saveFieldNote — cross-tenant authorization (integration)', () => {
  it('rejects when fieldId belongs to a foreign tenant and persists nothing', async () => {
    const before = await prisma.fieldNote.count({ where: { userId: testUser.id } });

    await expect(
      saveFieldNote(testUser.id, prisma, {
        rawContent: 'attempted cross-tenant write',
        category: 'OPERATION',
        extractedData: {},
        fieldId: foreignFieldId,
      }),
    ).rejects.toThrow(/Campo non trovato o non autorizzato per questo utente/);

    const after = await prisma.fieldNote.count({ where: { userId: testUser.id } });
    expect(after).toBe(before);
  });

  it('accepts when fieldId belongs to the caller and persists exactly one row', async () => {
    const before = await prisma.fieldNote.count({ where: { userId: testUser.id } });

    const result = await saveFieldNote(testUser.id, prisma, {
      rawContent: 'own-tenant write',
      category: 'OPERATION',
      extractedData: {},
      fieldId: ownFieldId,
    });

    expect(result.success).toBe(true);
    const after = await prisma.fieldNote.count({ where: { userId: testUser.id } });
    expect(after).toBe(before + 1);
  });

  it('executeBulkSaveFieldNotes: a single foreign fieldId aborts the whole batch (fail-fast)', async () => {
    const before = await prisma.fieldNote.count({ where: { userId: testUser.id } });

    const toolCalls = [
      {
        id: randomUUID(),
        args: {
          rawContent: 'own #1',
          category: 'OPERATION',
          extractedData: {},
          fieldId: ownFieldId,
        },
      },
      {
        id: randomUUID(),
        args: {
          rawContent: 'foreign infiltrated',
          category: 'OPERATION',
          extractedData: {},
          fieldId: foreignFieldId,
        },
      },
      {
        id: randomUUID(),
        args: {
          rawContent: 'own #2',
          category: 'OPERATION',
          extractedData: {},
          fieldId: ownFieldId,
        },
      },
    ];

    await expect(executeBulkSaveFieldNotes(prisma, testUser.id, toolCalls)).rejects.toThrow(
      /Uno o più campi non sono autorizzati per questo utente/,
    );

    const after = await prisma.fieldNote.count({ where: { userId: testUser.id } });
    expect(after).toBe(before);
  });
});
