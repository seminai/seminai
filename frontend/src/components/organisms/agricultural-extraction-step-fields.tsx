import { Button } from '@/components/ui/button';
import { EditableExtractionTableSwitch } from '@/components/molecules/editable-extraction-table-switch';
import { applyFieldRows } from '@/components/molecules/editable-extraction-table.helpers';
import {
  fieldExtractionColumns,
  toFieldExtractionRows,
} from '@/lib/extraction-review-columns';
import type { AgriculturalExtractionData } from '@/types/extraction';

interface AgriculturalExtractionStepFieldsProps {
  readonly draftData: AgriculturalExtractionData;
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly hasChanges: boolean;
  readonly onDraftChange: (next: AgriculturalExtractionData) => void;
  readonly onRestore: () => void;
  readonly onSave: () => Promise<void>;
}

export function AgriculturalExtractionStepFields({
  draftData,
  isEditable,
  isSaving,
  hasChanges,
  onDraftChange,
  onRestore,
  onSave,
}: AgriculturalExtractionStepFieldsProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <p className="shrink-0 text-sm text-muted-foreground">
        Verifica e correggi i campi estratti dal piano colturale. Puoi modificare direttamente le
        celle della tabella. Se inizio/fine conduzione non erano presenti nel file, è stato
        applicato automaticamente il periodo 1 gennaio – 31 dicembre dell&apos;anno corrente:
        correggile se il periodo reale è diverso.
      </p>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onRestore} disabled={!isEditable || !hasChanges}>
          Ripristina
        </Button>
        <Button size="sm" onClick={() => void onSave()} disabled={!isEditable || !hasChanges || isSaving}>
          {isSaving ? 'Salvataggio...' : 'Salva modifiche'}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <EditableExtractionTableSwitch
          title="Campi"
          headers={fieldExtractionColumns.map((column) => column.label)}
          columns={fieldExtractionColumns}
          rows={toFieldExtractionRows(draftData.fields)}
          editable={isEditable}
          onRowsChange={(rows) => {
            onDraftChange({
              ...draftData,
              fields: applyFieldRows(draftData.fields, rows),
            });
          }}
        />
      </div>
    </div>
  );
}
