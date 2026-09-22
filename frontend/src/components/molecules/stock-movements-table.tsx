import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, Save, X, Plus, Loader2, FileText, Trash2 } from 'lucide-react';

export interface StockRow {
  readonly id: string;
  readonly quantity: number;
  readonly unitOfMeasure: string;
  readonly type: string;
  readonly ddtCode: string;
  readonly date: string;
  readonly dateRaw: string | null;
  readonly supplier: string;
  readonly price: number;
  readonly unitOfMeasurePrice: string;
  readonly sourcePdfUrl: string | null;
  readonly sourcePdfFileName: string | null;
}

interface StockMovementsTableProps {
  readonly stocks: readonly StockRow[];
  readonly editingId: string | null;
  readonly editValues: Record<string, string>;
  readonly onEditStart: (stock: StockRow) => void;
  readonly onEditCancel: () => void;
  readonly onEditChange: (key: string, value: string) => void;
  readonly onEditSave: () => void;
  readonly isAddingNew: boolean;
  readonly onAddNew: () => void;
  readonly onCreateSave: () => void;
  readonly isSaving: boolean;
  readonly onOpenSourcePdf: (url: string, fileName: string) => void;
  readonly onDelete?: (stock: StockRow) => void;
}

const TH = 'px-3 py-1.5 text-left text-xs font-medium text-muted-foreground';
const TD = 'px-3 py-1.5 text-sm';

export function StockMovementsTable({
  stocks,
  editingId,
  editValues,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSave,
  isAddingNew,
  onAddNew,
  onCreateSave,
  isSaving,
  onOpenSourcePdf,
  onDelete,
}: StockMovementsTableProps) {
  const isCreateValid =
    editValues.type &&
    editValues.quantity &&
    editValues.unitOfMeasure &&
    editValues.price !== undefined &&
    editValues.unitOfMeasurePrice;

  return (
    <div>
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className={TH}>Tipo</th>
              <th className={TH}>Quantità</th>
              <th className={TH}>UDM</th>
              <th className={TH}>DDT</th>
              <th className={TH}>Data</th>
              <th className={TH}>Fornitore</th>
              <th className={`${TH} w-[110px]`}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) =>
              editingId === s.id ? (
                <EditRow
                  key={s.id}
                  values={editValues}
                  onChange={onEditChange}
                  onSave={onEditSave}
                  onCancel={onEditCancel}
                  isSaving={isSaving}
                />
              ) : (
                <ReadRow
                  key={s.id}
                  stock={s}
                  onEdit={() => onEditStart(s)}
                  onOpenSourcePdf={onOpenSourcePdf}
                  onDelete={onDelete ? () => onDelete(s) : undefined}
                  disabled={!!editingId || isAddingNew}
                />
              ),
            )}
            {isAddingNew && (
              <EditRow
                values={editValues}
                onChange={onEditChange}
                onSave={onCreateSave}
                onCancel={onEditCancel}
                isSaving={isSaving}
                isValid={!!isCreateValid}
              />
            )}
          </tbody>
        </table>
      </div>
      {!isAddingNew && !editingId && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onAddNew}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Aggiungi movimento
        </Button>
      )}
    </div>
  );
}

interface ReadRowProps {
  readonly stock: StockRow;
  readonly onEdit: () => void;
  readonly onOpenSourcePdf: (url: string, fileName: string) => void;
  readonly onDelete?: () => void;
  readonly disabled: boolean;
}

function ReadRow({ stock, onEdit, onOpenSourcePdf, onDelete, disabled }: ReadRowProps) {
  const hasSourcePdf = stock.sourcePdfUrl !== null;
  return (
    <tr className="border-t">
      <td className={TD}>
        <span className={stock.type === 'IN' ? 'text-green-600' : 'text-red-600'}>
          {stock.type === 'IN' ? 'Carico' : 'Scarico'}
        </span>
      </td>
      <td className={TD}>{Math.abs(stock.quantity)}</td>
      <td className={TD}>{stock.unitOfMeasure}</td>
      <td className={TD}>{stock.ddtCode}</td>
      <td className={TD}>{stock.date}</td>
      <td className={TD}>{stock.supplier}</td>
      <td className={TD}>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (stock.sourcePdfUrl) {
                onOpenSourcePdf(stock.sourcePdfUrl, stock.sourcePdfFileName ?? 'Documento');
              }
            }}
            disabled={disabled || !hasSourcePdf}
            title={hasSourcePdf ? 'Apri documento sorgente' : 'Documento sorgente non disponibile'}
            aria-label="Apri documento sorgente"
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
            disabled={disabled}
            title="Modifica movimento"
            aria-label="Modifica movimento"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={disabled}
              title="Elimina movimento"
              aria-label="Elimina movimento"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

interface EditRowProps {
  readonly values: Record<string, string>;
  readonly onChange: (key: string, value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly isSaving: boolean;
  readonly isValid?: boolean;
}

function EditRow({ values, onChange, onSave, onCancel, isSaving, isValid = true }: EditRowProps) {
  return (
    <tr className="border-t bg-muted/20">
      <td className={TD}>
        <Select
          value={values.type ?? 'IN'}
          onValueChange={(v) => onChange('type', v ?? 'IN')}
        >
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue>{(v) => (v === 'OUT' ? 'Scarico' : 'Carico')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="IN">Carico</SelectItem>
            <SelectItem value="OUT">Scarico</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className={TD}>
        <Input type="number" step="any" className="h-8 w-[80px]" value={values.quantity ?? ''} onChange={(e) => onChange('quantity', e.target.value)} />
      </td>
      <td className={TD}>
        <Input className="h-8 w-[70px]" value={values.unitOfMeasure ?? ''} onChange={(e) => onChange('unitOfMeasure', e.target.value)} />
      </td>
      <td className={TD}>
        <Input className="h-8 w-[90px]" value={values.ddtCode ?? ''} onChange={(e) => onChange('ddtCode', e.target.value)} />
      </td>
      <td className={TD}>
        <Input type="date" className="h-8 w-[130px]" value={values.date ?? ''} onChange={(e) => onChange('date', e.target.value)} />
      </td>
      <td className={TD}>
        <Input className="h-8 w-[120px]" value={values.supplier ?? ''} onChange={(e) => onChange('supplier', e.target.value)} />
      </td>
      <td className={TD}>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSave} disabled={isSaving || !isValid}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} disabled={isSaving}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
