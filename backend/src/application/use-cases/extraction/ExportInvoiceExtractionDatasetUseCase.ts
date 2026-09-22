import { stringify as stringifyYaml } from 'yaml';
import {
  type ExportEditLogsFilter,
  type EditLogWithExtractionAndFileRecord,
  type FileExtractionEditLogRecord,
  type IFileExtractionEditLogRepository,
} from '../../../domain/repositories/IFileExtractionEditLogRepository';

export interface DatasetEntry {
  readonly description: string;
  readonly vars: {
    readonly extraction_id: string;
    readonly category: string;
    readonly source_document_url: string;
    readonly source_document_name: string;
    readonly company_id: string;
    readonly llm_initial_output: string;
    readonly final_confirmed_output: string;
    readonly edit_count: number;
  };
  readonly assert: ReadonlyArray<{
    readonly type: 'javascript' | 'llm-rubric';
    readonly value: string;
  }>;
}

export interface ExportDatasetResult {
  readonly yaml: string;
  readonly entryCount: number;
}

const ASSERT_LENGTH_MATCH = `const out = JSON.parse(output);
const expected = JSON.parse(context.vars.final_confirmed_output);
return Array.isArray(out.entries) && out.entries.length === expected.entries.length;`;

const RUBRIC = `Output must align with final_confirmed_output: product names, quantities, units, dates.
Do not fabricate registration numbers. Match the human-corrected schema row-by-row.`;

/**
 * Builds a Promptfoo-compatible YAML dataset from confirmed invoice/ddt extractions
 * whose LLM extraction was edited by a user before confirmation. Each entry embeds
 * the source document URL so evals can re-run the extraction against the original PDF.
 */
export class ExportInvoiceExtractionDatasetUseCase {
  constructor(private readonly editLogRepository: IFileExtractionEditLogRepository) {}

  async execute(filter: ExportEditLogsFilter = {}): Promise<ExportDatasetResult> {
    const groups = await this.editLogRepository.findConfirmedInvoiceAndDdtLogs(filter);
    const entries = groups
      .map(toDatasetEntry)
      .filter((entry): entry is DatasetEntry => entry !== null);
    const yaml = stringifyYaml(entries);
    return { yaml, entryCount: entries.length };
  }
}

function toDatasetEntry(group: EditLogWithExtractionAndFileRecord): DatasetEntry | null {
  if (!group.fileUrl) return null;
  if (group.logs.length < 2) return null;
  const initial = group.logs.find((log) => log.source === 'LLM_INITIAL');
  if (!initial) return null;
  const final = group.logs[group.logs.length - 1];
  const initialJson = JSON.stringify(initial.afterData);
  const finalJson = JSON.stringify(final.afterData);
  if (initialJson === finalJson) return null;
  const editCount = group.logs.length - 1;
  return {
    description: buildDescription(group, editCount),
    vars: {
      extraction_id: group.extractionId,
      category: group.category,
      source_document_url: group.fileUrl,
      source_document_name: group.fileName,
      company_id: group.companyId,
      llm_initial_output: initialJson,
      final_confirmed_output: finalJson,
      edit_count: editCount,
    },
    assert: [
      { type: 'javascript', value: ASSERT_LENGTH_MATCH },
      { type: 'llm-rubric', value: RUBRIC },
    ],
  };
}

function buildDescription(group: EditLogWithExtractionAndFileRecord, editCount: number): string {
  const lastEdit = lastNonInitial(group.logs);
  const dateLabel = lastEdit ? lastEdit.createdAt.toISOString().slice(0, 10) : 'undated';
  return `${group.category} ${dateLabel} — ${group.fileName} (${editCount} edit${editCount === 1 ? '' : 's'})`;
}

function lastNonInitial(
  logs: readonly FileExtractionEditLogRecord[],
): FileExtractionEditLogRecord | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].source !== 'LLM_INITIAL') return logs[i];
  }
  return null;
}
