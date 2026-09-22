import { JobCategory } from '@prisma/client';
import { Job } from '../../../../../../domain/entities/Job';
import type { JobWithAssignmentDTO } from '../../../../../../domain/dtos/job-assignment.dto';
import type { IJobRepository } from '../../../../../../domain/repositories/IJobRepository';
import type {
  FieldNoteListItem,
  ListUserFieldNotesResult,
} from '../../../../tool/listUserFieldNotes';
import { listUserFieldNotes } from '../../../../tool/listUserFieldNotes';
import { createListDoneOperationsTool } from '../operations-history/list-done-operations.tool';

jest.mock('../../../../tool/listUserFieldNotes', () => ({
  listUserFieldNotes: jest.fn(),
}));

const mockedListUserFieldNotes = listUserFieldNotes as jest.MockedFunction<
  typeof listUserFieldNotes
>;

function buildRepository(jobs: JobWithAssignmentDTO[]): IJobRepository {
  return {
    findVerifiedJobsByUserIdWithAssignment: jest
      .fn()
      .mockResolvedValue({ jobs, total: jobs.length }),
  } as unknown as IJobRepository;
}

function buildJob(): JobWithAssignmentDTO {
  return {
    job: new Job(
      'job-1',
      'group-1',
      'unit-1',
      null,
      new Date('2026-06-15T00:00:00Z'),
      true,
      true,
      JobCategory.TREATMENT,
      100,
      'L',
      2,
      'kg',
      null,
      'Oidio',
      null,
      1,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      new Date(),
      new Date(),
    ),
    productionUnit: { id: 'unit-1', name: 'Vigneto', cropName: 'Vite', cropType: 'Uva', sauHa: 1 },
    products: [{ id: 'product-1', name: 'Zolfo', registrationNumber: null }],
    fields: [{ id: 'field-1', name: 'Campo' }],
    company: { id: 'company-1', name: 'Azienda Test' },
    machine: null,
  };
}

function buildFieldNote(): FieldNoteListItem {
  return {
    id: 'note-1',
    operationDate: '2026-06-16T00:00:00.000Z',
    category: 'OPERATION' as FieldNoteListItem['category'],
    status: 'PROCESSED' as FieldNoteListItem['status'],
    rawContentPreview: 'Trattamento registrato in campo',
    companyName: 'Azienda Test',
    fieldName: 'Campo',
    productionUnitName: 'Vigneto',
    productName: 'Rame',
    quantity: 3,
    unitOfMeasure: 'kg',
    hasAttachments: false,
    hasLocation: false,
  };
}

describe('list_done_operations tool', () => {
  beforeEach(() => {
    mockedListUserFieldNotes.mockReset();
  });

  it('returns verified archive operations and field note operations in separate sections', async () => {
    const inputJob = buildJob();
    const inputFieldNote = buildFieldNote();
    const repository = buildRepository([inputJob]);
    const fieldNoteResult: ListUserFieldNotesResult = {
      totalMatched: 1,
      returned: 1,
      truncated: false,
      items: [inputFieldNote],
    };
    mockedListUserFieldNotes.mockResolvedValue(fieldNoteResult);
    const tool = createListDoneOperationsTool('user-1', repository);

    const actualResult = JSON.parse(await tool.func({})) as {
      verifiedArchiveOperations: { readonly total: number; readonly markdownTable: string };
      fieldNoteOperations: { readonly total: number; readonly markdownTable: string };
    };

    expect(actualResult.verifiedArchiveOperations.total).toBe(1);
    expect(actualResult.verifiedArchiveOperations.markdownTable).toContain('Archivio verificato');
    expect(actualResult.fieldNoteOperations.total).toBe(1);
    expect(actualResult.fieldNoteOperations.markdownTable).toContain('Nota di campo');
    expect(mockedListUserFieldNotes).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', category: 'OPERATION' }),
    );
  });
});
