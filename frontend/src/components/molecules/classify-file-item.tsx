import { FileTypeIcon } from '@/components/atoms/file-type-icon';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CATEGORIE_OPTIONS, type CompanyOption } from '@/config/upload-options';
import { Loader2, Trash2 } from 'lucide-react';

interface ClassifyFileItemProps {
  readonly name: string;
  readonly format: string;
  readonly azienda: string;
  readonly categoria: string;
  readonly companies: readonly CompanyOption[];
  readonly categories?: readonly { readonly value: string; readonly label: string }[];
  readonly isSuggesting?: boolean;
  readonly onAziendaChange: (value: string | null) => void;
  readonly onCategoriaChange: (value: string | null) => void;
  readonly onPreview?: () => void;
  readonly onRemove?: () => void;
}

function SuggestingHint() {
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-normal normal-case text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      categorizzazione…
    </span>
  );
}

export function ClassifyFileItem({
  name,
  format,
  azienda,
  categoria,
  companies,
  categories = CATEGORIE_OPTIONS,
  isSuggesting = false,
  onAziendaChange,
  onCategoriaChange,
  onPreview,
  onRemove,
}: ClassifyFileItemProps) {
  const showAziendaHint = isSuggesting && !azienda;
  const showCategoriaHint = isSuggesting && !categoria;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left hover:underline"
          onClick={onPreview}
        >
          <FileTypeIcon format={format} className="h-5 w-5 shrink-0" />
          <span className="truncate text-sm font-medium">{name}</span>
        </button>
        <button
          type="button"
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
          onClick={onRemove}
          aria-label={`Rimuovi ${name}`}
          title="Rimuovi file"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Azienda
            {showAziendaHint && <SuggestingHint />}
          </label>
          <SearchableSelect
            value={azienda}
            options={companies}
            placeholder="Scegli azienda"
            searchPlaceholder="Cerca azienda..."
            emptyMessage="Nessuna azienda trovata."
            onChange={onAziendaChange}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Categoria
            {showCategoriaHint && <SuggestingHint />}
          </label>
          <Select value={categoria} onValueChange={onCategoriaChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Scegli categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
