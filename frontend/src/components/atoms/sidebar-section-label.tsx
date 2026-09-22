interface SidebarSectionLabelProps {
  readonly label: string;
}

export function SidebarSectionLabel({ label }: SidebarSectionLabelProps) {
  return (
    <p className="px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground">
      {label}
    </p>
  );
}
