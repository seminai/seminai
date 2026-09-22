import { StatusBadge } from '@/components/atoms/status-badge';

interface FileInfo {
  readonly titolo: string;
  readonly azienda: string;
  readonly formato: string;
  readonly tipoDiFile: string;
  readonly aggiornato: string;
  readonly status: string;
}

interface FileInfoPanelProps {
  readonly file: FileInfo;
}

export function FileInfoPanel({ file }: FileInfoPanelProps) {
  const items = [
    { label: 'Nome', value: file.titolo },
    { label: 'Azienda', value: file.azienda },
    { label: 'Formato', value: file.formato },
    { label: 'Tipo di file', value: file.tipoDiFile },
    { label: 'Aggiornato', value: file.aggiornato },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[120px_1fr] gap-2">
          <span className="text-sm text-muted-foreground">{item.label}</span>
          <span className="text-sm font-medium">
            {item.value === '-' ? (
              <span className="text-muted-foreground">-</span>
            ) : (
              item.value
            )}
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[120px_1fr] gap-2">
        <span className="text-sm text-muted-foreground">Status</span>
        <StatusBadge status={file.status} />
      </div>
    </div>
  );
}
