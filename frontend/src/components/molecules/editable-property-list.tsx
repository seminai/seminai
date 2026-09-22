import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface EditablePropertyItem {
  readonly label: string;
  readonly value: string | number | null | undefined;
  readonly key: string;
  readonly editable?: boolean;
  readonly type?: 'text' | 'number' | 'select' | 'textarea' | 'date';
  readonly options?: readonly SelectOption[];
}

interface EditablePropertyListProps {
  readonly properties: readonly EditablePropertyItem[];
  readonly values: Record<string, string>;
  readonly onChange: (key: string, value: string) => void;
}

export function EditablePropertyList({
  properties,
  values,
  onChange,
}: EditablePropertyListProps) {
  return (
    <dl className="grid gap-3">
      {properties.map((prop) => (
        <div key={prop.label} className="grid grid-cols-[140px_1fr] gap-2 items-start">
          <dt className="text-sm text-muted-foreground pt-1.5">{prop.label}</dt>
          <dd>
            {prop.editable === false ? (
              <span className="text-sm font-medium pt-1.5 inline-block">
                {prop.value != null && prop.value !== '' ? String(prop.value) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </span>
            ) : (
              <EditableField
                prop={prop}
                value={values[prop.key] ?? ''}
                onChange={(v) => onChange(prop.key, v)}
              />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface EditableFieldProps {
  readonly prop: EditablePropertyItem;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function EditableField({ prop, value, onChange }: EditableFieldProps) {
  const type = prop.type ?? 'text';

  if (type === 'select' && prop.options) {
    const options = prop.options;
    return (
      <Select value={value} onValueChange={(v) => { if (v != null) onChange(v); }}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {(v: unknown) =>
              options.find((opt) => opt.value === v)?.label ??
              (typeof v === 'string' ? v : '')
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === 'textarea') {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
        rows={3}
      />
    );
  }

  if (type === 'date') {
    return (
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
      />
    );
  }

  return (
    <Input
      type={type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm"
      step={type === 'number' ? 'any' : undefined}
    />
  );
}
