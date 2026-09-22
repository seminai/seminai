import type { ReactNode } from 'react';

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}

export function KeyRow({ label, value, mono = false }: RowProps) {
  if (!value.trim() || value === '—' || value === '-') return null;
  return <Row label={label} value={value} mono={mono} />;
}

export function KeyRowAlways({ label, value, mono = false }: RowProps) {
  return <Row label={label} value={value} mono={mono} />;
}

function Row({ label, value, mono }: RowProps) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(10rem,42%)_1fr] sm:gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? 'font-mono text-xs wrap-break-word text-foreground'
            : 'whitespace-pre-wrap text-[1.02rem] font-semibold wrap-break-word text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}

export function KeyRowNode({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(10rem,42%)_1fr] sm:gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm wrap-break-word text-foreground">{children}</div>
    </div>
  );
}
