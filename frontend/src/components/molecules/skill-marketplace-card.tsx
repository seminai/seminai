import type { ReactNode } from "react";
import { Copy, Eye, Link2, Loader2, Sparkles, Star, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SkillMarketplaceItem } from "@/types/skill-marketplace";

interface SkillMarketplaceCardProps {
  readonly skill: SkillMarketplaceItem;
  readonly isDuplicating: boolean;
  readonly onDuplicate: (skillId: string) => void;
}

export function SkillMarketplaceCard({
  skill,
  isDuplicating,
  onDuplicate,
}: SkillMarketplaceCardProps) {
  return (
    <article className="flex min-h-44 flex-col rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-md border bg-violet-50 p-2 text-violet-700">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
            <Badge variant="secondary">Skill AI</Badge>
            {skill.isFeatured && (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <Star className="h-3 w-3" />
                In evidenza
              </Badge>
            )}
          </div>
          {skill.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {skill.description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <Meta icon={<UserRound />} label={skill.creator.name} />
        <Meta icon={<Eye />} label={`${skill.viewCount} visite sul Hub`} />
        {skill.sourceRuleName && (
          <Meta icon={<Link2 />} label={`Basato su: ${skill.sourceRuleName}`} />
        )}
      </div>
      <div className="mt-auto flex items-center justify-end pt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDuplicate(skill.id)}
          disabled={isDuplicating}
        >
          {isDuplicating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Duplica
        </Button>
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
