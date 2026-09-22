import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  FIELD_EXCLUSION_LABELS,
  type ExcludedFieldInfo,
} from '@/lib/field-exclusion-reason';

interface ExcludedFieldsListProps {
  readonly fields: readonly ExcludedFieldInfo[];
  /** Expanded by default when the available list is empty. */
  readonly defaultOpen: boolean;
}

/** Greyed-out list of company fields excluded from availability, with the reason. */
export function ExcludedFieldsList({ fields, defaultOpen }: ExcludedFieldsListProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  if (fields.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="excluded-fields-panel"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Campi non disponibili ({fields.length})
      </button>
      {isOpen ? (
        <div id="excluded-fields-panel" className="mt-2 space-y-2">
          {fields.map((field) => (
            <div
              key={field.id}
              className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md border p-2 opacity-60"
            >
              <p className="min-w-0 truncate text-sm">{field.name}</p>
              <Badge variant="outline" className="shrink-0 text-xs">
                {FIELD_EXCLUSION_LABELS[field.reason]}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
