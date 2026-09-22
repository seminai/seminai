import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type OcrProvider = 'mistral' | 'openai';

interface OcrProviderSelectorProps {
  readonly value: OcrProvider;
  readonly onValueChange: (value: OcrProvider) => void;
  readonly disabled?: boolean;
}

export function OcrProviderSelector({ value, onValueChange, disabled }: OcrProviderSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="ocr-provider">OCR provider</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as OcrProvider)}
        disabled={disabled}
      >
        <SelectTrigger id="ocr-provider" className="w-full">
          <SelectValue placeholder="Select OCR provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mistral">Mistral OCR (recommended: better accuracy)</SelectItem>
          <SelectItem value="openai">OpenAI Vision</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
