import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Severity = 'critical' | 'warning' | 'info';

interface ExpirySeverityIconProps {
  readonly severity: Severity;
  readonly className?: string;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-500' },
  warning: { icon: AlertCircle, color: 'text-yellow-500' },
  info: { icon: Info, color: 'text-blue-500' },
} as const;

export function ExpirySeverityIcon({ severity, className }: ExpirySeverityIconProps) {
  const { icon: Icon, color } = SEVERITY_CONFIG[severity];
  return <Icon className={cn('h-4 w-4', color, className)} />;
}
