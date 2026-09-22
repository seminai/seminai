import { Badge } from '@/components/ui/badge';

interface LabelVerifiedBadgeProps {
  readonly isVerified: boolean;
}

/** Renders a label's verification status as a colored badge. */
export function LabelVerifiedBadge({ isVerified }: LabelVerifiedBadgeProps) {
  if (isVerified) {
    return <Badge className="border-green-200 bg-green-100 text-green-700">Verificata</Badge>;
  }
  return <Badge className="border-amber-200 bg-amber-100 text-amber-700">Non verificata</Badge>;
}
