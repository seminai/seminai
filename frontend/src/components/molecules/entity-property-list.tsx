export interface PropertyItem {
  readonly label: string;
  readonly value: string | number | null | undefined;
}

interface EntityPropertyListProps {
  readonly properties: readonly PropertyItem[];
}

export function EntityPropertyList({ properties }: EntityPropertyListProps) {
  return (
    <dl className="grid gap-3">
      {properties.map((prop) => (
        <div key={prop.label} className="grid grid-cols-[140px_1fr] gap-2">
          <dt className="text-sm text-muted-foreground">{prop.label}</dt>
          <dd className="text-sm font-medium">
            {prop.value != null && prop.value !== '' ? String(prop.value) : (
              <span className="text-muted-foreground">-</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
