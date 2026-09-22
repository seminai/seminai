import type { ReactNode } from "react";
import { Copy, Database, Eye, FileSearch, Loader2, Star, UserRound } from "lucide-react";
import { RULE_CATEGORY_LABELS } from "@/constants/rule-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RuleMarketplaceItem } from "@/types/rule-marketplace";

interface RuleMarketplaceCardProps {
  readonly rule: RuleMarketplaceItem;
  readonly isDuplicating: boolean;
  readonly onUseRule: (rule: RuleMarketplaceItem) => void;
  readonly onDuplicate: (ruleId: string) => void;
}

export function RuleMarketplaceCard({
  rule,
  isDuplicating,
  onUseRule,
  onDuplicate,
}: RuleMarketplaceCardProps) {
  return (
    <article className="flex min-h-44 flex-col rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-md border bg-emerald-50 p-2 text-emerald-700">
          <FileSearch className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{rule.name}</h3>
            <Badge variant="secondary">Community</Badge>
            <Badge variant="outline" className="gap-1 text-emerald-700">
              Pubblicato su Hub
            </Badge>
            {rule.isFeatured && (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <Star className="h-3 w-3" />
                In evidenza
              </Badge>
            )}
          </div>
          {rule.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {rule.description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <Meta icon={<Database />} label={RULE_CATEGORY_LABELS[rule.category]} />
        <Meta icon={<UserRound />} label={rule.creator.name} />
        <Meta icon={<Eye />} label={`${rule.viewCount} visite sul Hub`} />
        {rule.region && <Meta label={rule.region} />}
        {rule.sourceDocument && <Meta label={rule.sourceDocument} />}
      </div>
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-muted-foreground">
          {rule.isVectorized ? "PDF indicizzato" : "PDF non indicizzato"}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDuplicate(rule.id)}
            disabled={isDuplicating}
          >
            {isDuplicating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Duplica
          </Button>
          <Button size="sm" onClick={() => onUseRule(rule)}>
            Usa
          </Button>
        </div>
      </div>
    </article>
  );
}

function Meta({
  icon,
  label,
}: {
  readonly icon?: ReactNode;
  readonly label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {icon && <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      <span className="truncate">{label}</span>
    </div>
  );
}
