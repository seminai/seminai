import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { EntityPropertyList } from '@/components/molecules/entity-property-list';
import type { PropertyItem } from '@/components/molecules/entity-property-list';
import { EditablePropertyList } from '@/components/molecules/editable-property-list';
import type { EditablePropertyItem } from '@/components/molecules/editable-property-list';
import { Button } from '@/components/ui/button';
import { FileSearch, PanelRightClose, Pencil, Save, X, Loader2 } from 'lucide-react';

interface ReadOnlyProps {
  readonly title: string;
  readonly properties: readonly PropertyItem[];
  readonly emptyMessage?: string;
  readonly onClose?: () => void;
  readonly children?: ReactNode;
  readonly editableProperties?: undefined;
  readonly onSave?: undefined;
  readonly isSaving?: undefined;
}

interface EditableProps {
  readonly title: string;
  readonly properties: readonly PropertyItem[];
  readonly emptyMessage?: string;
  readonly onClose?: () => void;
  readonly children?: ReactNode;
  readonly editableProperties: readonly EditablePropertyItem[];
  readonly onSave: (data: Record<string, string>) => Promise<void> | void;
  readonly isSaving?: boolean;
}

type EntityDetailPanelProps = ReadOnlyProps | EditableProps;

export function EntityDetailPanel({
  title,
  properties,
  emptyMessage = 'Seleziona un elemento dalla lista',
  onClose,
  children,
  editableProperties,
  onSave,
  isSaving = false,
}: EntityDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const isEditable = editableProperties !== undefined && onSave !== undefined;

  const initEditValues = useCallback(() => {
    if (!editableProperties) return;
    const initial: Record<string, string> = {};
    for (const prop of editableProperties) {
      if (prop.editable !== false) {
        initial[prop.key] = prop.value != null ? String(prop.value) : '';
      }
    }
    setEditValues(initial);
  }, [editableProperties]);

  const handleEdit = useCallback(() => {
    initEditValues();
    setIsEditing(true);
  }, [initEditValues]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValues({});
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await onSave?.(editValues);
      setIsEditing(false);
      setEditValues({});
    } catch {
      // Keep edit mode active so the caller can surface the error and let the user retry.
    }
  }, [onSave, editValues]);

  const handleChange = useCallback((key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const readOnlyProperties = useMemo<readonly PropertyItem[]>(() => {
    if (!isEditing || !editableProperties) return properties;
    return [];
  }, [isEditing, editableProperties, properties]);

  if (properties.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileSearch className="h-12 w-12" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
        <div className="flex gap-1">
          {isEditable && (
            isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Annulla
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  )}
                  Salva
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleEdit}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Modifica
              </Button>
            )
          )}
          {onClose && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onClose}
              title="Chiudi sidebar"
              aria-label="Chiudi sidebar"
              className="shrink-0"
            >
              <PanelRightClose />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isEditing && editableProperties ? (
          <EditablePropertyList
            properties={editableProperties}
            values={editValues}
            onChange={handleChange}
          />
        ) : (
          <EntityPropertyList properties={readOnlyProperties} />
        )}
        {children ? <div className="mt-4 border-t pt-4">{children}</div> : null}
      </div>
    </div>
  );
}
