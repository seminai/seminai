import { parse as parseYaml } from 'yaml';
import { ExportInvoiceExtractionDatasetUseCase } from '../ExportInvoiceExtractionDatasetUseCase';
import {
  type EditLogWithExtractionAndFileRecord,
  type FileExtractionEditLogRecord,
  type IFileExtractionEditLogRepository,
} from '../../../../domain/repositories/IFileExtractionEditLogRepository';

function log(
  overrides: Partial<FileExtractionEditLogRecord> & {
    source: FileExtractionEditLogRecord['source'];
    version: number;
    after: unknown;
  },
): FileExtractionEditLogRecord {
  return {
    id: `log-${overrides.version}`,
    extractionId: overrides.extractionId ?? 'ext-X',
    version: overrides.version,
    source: overrides.source,
    beforeData: overrides.beforeData ?? null,
    afterData: overrides.after,
    userId: overrides.userId ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-05-15T10:00:00.000Z'),
  };
}

function makeRepo(
  groups: readonly EditLogWithExtractionAndFileRecord[],
): jest.Mocked<IFileExtractionEditLogRepository> {
  return {
    append: jest.fn(),
    findByExtractionId: jest.fn(),
    findConfirmedInvoiceAndDdtLogs: jest.fn().mockResolvedValue(groups),
  };
}

describe('ExportInvoiceExtractionDatasetUseCase', () => {
  it('emits an entry per confirmed invoice with at least one user edit and a fileUrl', async () => {
    const groups: EditLogWithExtractionAndFileRecord[] = [
      {
        extractionId: 'ext-1',
        category: 'invoice',
        companyId: 'co-1',
        fileName: 'fattura-001.pdf',
        fileUrl: 'https://docs.example/inv-1.pdf',
        logs: [
          log({ source: 'LLM_INITIAL', version: 0, after: { entries: [{ name: 'urea-llm' }] } }),
          log({
            source: 'USER_EDIT',
            version: 1,
            after: { entries: [{ name: 'urea-fixed' }] },
            beforeData: { entries: [{ name: 'urea-llm' }] },
          }),
        ],
      },
    ];
    const useCase = new ExportInvoiceExtractionDatasetUseCase(makeRepo(groups));

    const result = await useCase.execute({});

    expect(result.entryCount).toBe(1);
    const parsed = parseYaml(result.yaml) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(1);
    const entry = parsed[0] as {
      vars: Record<string, unknown>;
      assert: Array<{ type: string }>;
    };
    expect(entry.vars.source_document_url).toBe('https://docs.example/inv-1.pdf');
    expect(entry.vars.category).toBe('invoice');
    expect(entry.vars.edit_count).toBe(1);
    expect(JSON.parse(entry.vars.llm_initial_output as string)).toEqual({
      entries: [{ name: 'urea-llm' }],
    });
    expect(JSON.parse(entry.vars.final_confirmed_output as string)).toEqual({
      entries: [{ name: 'urea-fixed' }],
    });
    expect(entry.assert.map((a) => a.type)).toEqual(['javascript', 'llm-rubric']);
  });

  it('skips extractions without a fileUrl', async () => {
    const groups: EditLogWithExtractionAndFileRecord[] = [
      {
        extractionId: 'ext-no-file',
        category: 'invoice',
        companyId: 'co-1',
        fileName: 'no-file.pdf',
        fileUrl: null,
        logs: [
          log({ source: 'LLM_INITIAL', version: 0, after: { entries: [] } }),
          log({ source: 'USER_EDIT', version: 1, after: { entries: [{ name: 'x' }] } }),
        ],
      },
    ];
    const useCase = new ExportInvoiceExtractionDatasetUseCase(makeRepo(groups));
    const result = await useCase.execute({});
    expect(result.entryCount).toBe(0);
    expect(parseYaml(result.yaml)).toEqual([]);
  });

  it('skips extractions without any edit beyond LLM_INITIAL', async () => {
    const groups: EditLogWithExtractionAndFileRecord[] = [
      {
        extractionId: 'ext-no-edit',
        category: 'invoice',
        companyId: 'co-1',
        fileName: 'unchanged.pdf',
        fileUrl: 'https://docs.example/u.pdf',
        logs: [log({ source: 'LLM_INITIAL', version: 0, after: { entries: [] } })],
      },
    ];
    const useCase = new ExportInvoiceExtractionDatasetUseCase(makeRepo(groups));
    expect((await useCase.execute({})).entryCount).toBe(0);
  });

  it('skips extractions whose final equals LLM_INITIAL by JSON value', async () => {
    const same = { entries: [{ name: 'same' }] };
    const groups: EditLogWithExtractionAndFileRecord[] = [
      {
        extractionId: 'ext-equal',
        category: 'invoice',
        companyId: 'co-1',
        fileName: 'equal.pdf',
        fileUrl: 'https://docs.example/e.pdf',
        logs: [
          log({ source: 'LLM_INITIAL', version: 0, after: same }),
          log({ source: 'CONFIRM_OVERRIDE', version: 1, after: { ...same } }),
        ],
      },
    ];
    const useCase = new ExportInvoiceExtractionDatasetUseCase(makeRepo(groups));
    expect((await useCase.execute({})).entryCount).toBe(0);
  });

  it('handles ddt category and emits stable entry shape', async () => {
    const groups: EditLogWithExtractionAndFileRecord[] = [
      {
        extractionId: 'ext-ddt',
        category: 'ddt',
        companyId: 'co-2',
        fileName: 'ddt-A12.pdf',
        fileUrl: 'https://docs.example/ddt-A12.pdf',
        logs: [
          log({ source: 'LLM_INITIAL', version: 0, after: { entries: [{ q: 1 }] } }),
          log({ source: 'USER_EDIT', version: 1, after: { entries: [{ q: 2 }] } }),
          log({ source: 'CONFIRM_OVERRIDE', version: 2, after: { entries: [{ q: 3 }] } }),
        ],
      },
    ];
    const useCase = new ExportInvoiceExtractionDatasetUseCase(makeRepo(groups));
    const result = await useCase.execute({});
    expect(result.entryCount).toBe(1);
    const entry = (parseYaml(result.yaml) as Array<{ vars: Record<string, unknown> }>)[0];
    expect(entry.vars.category).toBe('ddt');
    expect(entry.vars.edit_count).toBe(2);
    expect(JSON.parse(entry.vars.final_confirmed_output as string)).toEqual({
      entries: [{ q: 3 }],
    });
  });
});
