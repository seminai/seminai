import { JobCategory } from '@prisma/client';
import { Job } from '../../../../../../domain/entities/Job';
import type { JobWithAssignmentDTO } from '../../../../../../domain/dtos/job-assignment.dto';
import {
  formatOperationSummariesMarkdown,
  mapFieldNoteToSummary,
  mapVerifiedJobToSummary,
} from '../operations-history/operation-summary.formatter';
import type { FieldNoteListItem } from '../../../../tool/listUserFieldNotes';

function buildJobSummary(): JobWithAssignmentDTO {
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
      1500,
      'L',
      12,
      'kg',
      null,
      'Peronospora',
      null,
      3,
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
    productionUnit: {
      id: 'unit-1',
      name: 'Vigneto Nord',
      cropName: 'Vite',
      cropType: 'Sangiovese',
      sauHa: 3,
    },
    products: [{ id: 'product-1', name: 'Rame Test', registrationNumber: '12345' }],
    fields: [{ id: 'field-1', name: 'Campo Nord' }],
    company: { id: 'company-1', name: 'Azienda Test' },
    machine: null,
    dosageAgentJobName: null,
  };
}

function buildFieldNote(): FieldNoteListItem {
  return {
    id: 'note-1',
    operationDate: '2026-06-10T00:00:00.000Z',
    category: 'OPERATION' as FieldNoteListItem['category'],
    status: 'PROCESSED' as FieldNoteListItem['status'],
    rawContentPreview: 'Ho dato zolfo sul vigneto',
    companyName: 'Azienda Test',
    fieldName: 'Campo Nord',
    productionUnitName: 'Vigneto Nord',
    productName: 'Zolfo Test',
    quantity: 5,
    unitOfMeasure: 'kg',
    hasAttachments: false,
    hasLocation: false,
  };
}

describe('operation summary formatter', () => {
  it('renders verified archive operations without technical identifiers', () => {
    const summary = mapVerifiedJobToSummary(buildJobSummary());
    const markdown = formatOperationSummariesMarkdown([summary]);

    expect(markdown).toContain('Archivio verificato');
    expect(markdown).toContain('Vigneto Nord');
    expect(markdown).toContain('Rame Test');
    expect(markdown).toContain('Peronospora');
    expect(markdown).not.toContain('job-1');
    expect(markdown).not.toContain('group-1');
  });

  it('renders field note operations as note di campo', () => {
    const summary = mapFieldNoteToSummary(buildFieldNote());
    const markdown = formatOperationSummariesMarkdown([summary]);

    expect(markdown).toContain('Nota di campo');
    expect(markdown).toContain('Zolfo Test');
    expect(markdown).toContain('Ho dato zolfo sul vigneto');
  });
});
