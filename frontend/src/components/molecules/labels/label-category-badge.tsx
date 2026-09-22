import { Badge } from '@/components/ui/badge';
import type { LabelCategory } from '@/types/label';

interface LabelCategoryBadgeProps {
  readonly category: LabelCategory | null;
}

/** Renders a label's category as a colored badge (fitosanitario = blue, fertilizzante = orange). */
export function LabelCategoryBadge({ category }: LabelCategoryBadgeProps) {
  if (!category) return <span className="text-muted-foreground">—</span>;
  if (category === 'FERTILIZER') {
    return (
      <Badge className="border-orange-200 bg-orange-100 text-orange-700">Fertilizzante</Badge>
    );
  }
  return <Badge className="border-blue-200 bg-blue-100 text-blue-700">Fitosanitario</Badge>;
}
