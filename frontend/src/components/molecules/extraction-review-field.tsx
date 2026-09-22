import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ExtractionReviewLinesField } from '@/components/molecules/extraction-review-lines-field';
import type { ExtractionFieldDescriptor } from '@/lib/agent-chat-events';

interface ExtractionReviewFieldProps {
  readonly descriptor: ExtractionFieldDescriptor;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly disabled?: boolean;
}

function asInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ExtractionReviewField({
  descriptor,
  value,
  onChange,
  disabled,
}: ExtractionReviewFieldProps) {
  if (descriptor.type === 'lines') {
    return (
      <ExtractionReviewLinesField
        descriptor={descriptor}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  const inputValue = asInputValue(value);
  const inputId = `review-field-${descriptor.key}`;

  function handleChange(raw: string) {
    if (raw === '') {
      onChange(undefined);
      return;
    }
    if (descriptor.type === 'number') {
      const parsed = Number(raw);
      onChange(Number.isFinite(parsed) ? parsed : raw);
      return;
    }
    onChange(raw);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="text-xs font-medium">
        {descriptor.labelIt}
        {descriptor.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {descriptor.type === 'textarea' ? (
        <Textarea
          id={inputId}
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={descriptor.placeholder}
          disabled={disabled}
          rows={3}
          className="text-sm"
        />
      ) : (
        <Input
          id={inputId}
          type={descriptor.type === 'date' ? 'date' : descriptor.type === 'number' ? 'number' : 'text'}
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={descriptor.placeholder}
          disabled={disabled}
          className="text-sm"
        />
      )}
      {descriptor.helpIt && (
        <p className="text-[10px] text-muted-foreground">{descriptor.helpIt}</p>
      )}
    </div>
  );
}
