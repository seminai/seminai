import {
  FileSpreadsheet,
  FileText,
  FileImage,
  File,
  FileBarChart,
  type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileSpreadsheet,
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  svg: FileImage,
  report: FileBarChart,
};

interface FileTypeIconProps {
  readonly format: string;
  readonly className?: string;
}

export function FileTypeIcon({ format, className }: FileTypeIconProps) {
  const normalized = format.replace('.', '').toLowerCase();
  const Icon = ICON_MAP[normalized] ?? File;

  return <Icon className={cn('h-4 w-4 text-muted-foreground', className)} />;
}
