interface LabelFieldRowProps {
  readonly label: string;
  readonly value?: string | number | null;
}

/** A single label/value row in a label detail table. Renders nothing when the value is empty. */
export function LabelFieldRow({ label, value }: LabelFieldRowProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 border-b py-1.5 text-sm last:border-b-0">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="whitespace-pre-wrap break-words">{value}</span>
    </div>
  );
}
