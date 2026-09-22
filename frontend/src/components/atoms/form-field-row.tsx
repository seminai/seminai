import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FormFieldRowProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: ReactNode;
}

export function FormFieldRow({ id, label, error, children }: FormFieldRowProps) {
  return (
    <div className="mb-3 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
