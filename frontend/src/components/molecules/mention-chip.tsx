import { X, Building2, Package, MapPin, Sprout, Warehouse, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MentionEntityType } from '@/types/mention';

interface MentionChipProps {
  readonly type: MentionEntityType;
  readonly label: string;
  readonly onRemove: () => void;
  readonly disabled?: boolean;
}

const TYPE_CONFIG: Record<MentionEntityType, {
  icon: typeof Building2;
  className: string;
}> = {
  company: { icon: Building2, className: 'border-blue-200 bg-blue-50 text-blue-700' },
  product: { icon: Package, className: 'border-green-200 bg-green-50 text-green-700' },
  field: { icon: MapPin, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  production_unit: { icon: Sprout, className: 'border-violet-200 bg-violet-50 text-violet-700' },
  stock: { icon: Warehouse, className: 'border-orange-200 bg-orange-50 text-orange-700' },
  file: { icon: FileText, className: 'border-slate-200 bg-slate-50 text-slate-700' },
};

export function MentionChip({ type, label, onRemove, disabled }: MentionChipProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1 pr-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      <span className="max-w-32 truncate text-xs">{label}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        disabled={disabled}
        className="h-4 w-4 p-0"
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  );
}
