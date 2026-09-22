import { useWorkspace } from "@/hooks/use-workspace";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspacesWorkspaceIdSkillsQueryKey,
  useGetSkillsMarketplace,
  usePostWorkspacesWorkspaceIdSkillsFromPublicSkillId,
} from "@/generated/api/skills/skills";
import { toast } from "sonner";
import { RulesMarketplacePager } from "@/components/molecules/rules-marketplace-pager";
import { Input } from "@/components/ui/input";
import type {
  RuleMarketplaceItem,
  RuleMarketplacePage,
} from "@/types/rule-marketplace";
import { RuleMarketplaceCard } from "@/components/molecules/rule-marketplace-card";
import type {
  SkillMarketplaceItem,
  SkillMarketplacePage,
} from "@/types/skill-marketplace";
import { SkillMarketplaceCard } from "@/components/molecules/skill-marketplace-card";
import { extractObject } from "@/lib/api-response";
import type { RuleCategory } from "@/types/workspace";
import { PAGE_SIZE } from './rules-marketplace-tab.part-01-page-size';

export function SkillsMarketplacePanel({
  search,
  creator,
  page,
  onPageChange,
}: {
  readonly search: string;
  readonly creator: string;
  readonly page: number;
  readonly onPageChange: (page: number) => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const marketplaceQuery = useGetSkillsMarketplace({
    search: search || undefined,
    creator: creator || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const duplicateMutation = usePostWorkspacesWorkspaceIdSkillsFromPublicSkillId({
    mutation: {
      onSuccess: () => {
        toast.success("Skill duplicato come bozza privata");
        void queryClient.invalidateQueries({
          queryKey: getGetWorkspacesWorkspaceIdSkillsQueryKey(activeWorkspaceId),
        });
      },
      onError: () => toast.error("Impossibile duplicare lo skill"),
    },
  });
  const marketplace = mapSkillMarketplacePage(marketplaceQuery.data?.data);

  return (
    <>
      <SkillMarketplaceList
        isLoading={marketplaceQuery.isLoading}
        marketplace={marketplace}
        duplicatingSkillId={duplicateMutation.variables?.skillId ?? null}
        isDuplicating={duplicateMutation.isPending}
        onDuplicate={(skillId) =>
          duplicateMutation.mutate({ workspaceId: activeWorkspaceId, skillId })
        }
      />
      <RulesMarketplacePager
        page={page}
        marketplace={marketplace}
        pageSize={PAGE_SIZE}
        onPageChange={onPageChange}
      />
    </>
  );
}

export function FilterInput({
  icon,
  value,
  placeholder,
  onChange,
}: {
  readonly icon?: React.ReactNode;
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
      )}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={icon ? "h-8 pl-8 text-sm" : "h-8 text-sm"}
      />
    </div>
  );
}

export function RuleMarketplaceList({
  isLoading,
  marketplace,
  duplicatingRuleId,
  isDuplicating,
  onUseRule,
  onDuplicate,
}: {
  readonly isLoading: boolean;
  readonly marketplace: RuleMarketplacePage;
  readonly duplicatingRuleId: string | null;
  readonly isDuplicating: boolean;
  readonly onUseRule: (rule: RuleMarketplaceItem) => void;
  readonly onDuplicate: (ruleId: string) => void;
}) {
  if (isLoading) return <EmptyState label="Caricamento marketplace..." />;
  if (marketplace.items.length === 0)
    return <EmptyState label="Nessuna rule pubblica trovata" />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {marketplace.items.map((rule) => (
        <RuleMarketplaceCard
          key={rule.id}
          rule={rule}
          isDuplicating={isDuplicating && duplicatingRuleId === rule.id}
          onUseRule={onUseRule}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}

export function SkillMarketplaceList({
  isLoading,
  marketplace,
  duplicatingSkillId,
  isDuplicating,
  onDuplicate,
}: {
  readonly isLoading: boolean;
  readonly marketplace: SkillMarketplacePage;
  readonly duplicatingSkillId: string | null;
  readonly isDuplicating: boolean;
  readonly onDuplicate: (skillId: string) => void;
}) {
  if (isLoading) return <EmptyState label="Caricamento marketplace..." />;
  if (marketplace.items.length === 0)
    return <EmptyState label="Nessuno skill pubblico trovato" />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {marketplace.items.map((skill) => (
        <SkillMarketplaceCard
          key={skill.id}
          skill={skill}
          isDuplicating={isDuplicating && duplicatingSkillId === skill.id}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}

export function EmptyState({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function mapRuleMarketplacePage(raw: unknown): RuleMarketplacePage {
  const page = extractObject(raw, "marketplace");
  const items = Array.isArray(page?.items)
    ? page.items.map(mapRuleMarketplaceItem)
    : [];
  return {
    items,
    total: toNumber(page?.total),
    page: toNumber(page?.page) || 1,
    limit: toNumber(page?.limit) || PAGE_SIZE,
    hasNextPage: page?.hasNextPage === true,
  };
}

export function mapRuleMarketplaceItem(raw: unknown): RuleMarketplaceItem {
  const item = (raw ?? {}) as Record<string, unknown>;
  const creator = (item.creator ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    workspaceId: String(item.workspaceId ?? ""),
    name: String(item.name ?? ""),
    description: item.description ? String(item.description) : null,
    category: (item.category as RuleCategory) ?? "CUSTOM",
    status: "ACTIVE",
    sourceUrl: item.sourceUrl ? String(item.sourceUrl) : null,
    sourceDocument: item.sourceDocument ? String(item.sourceDocument) : null,
    region: item.region ? String(item.region) : null,
    validFrom: item.validFrom ? String(item.validFrom) : null,
    validUntil: item.validUntil ? String(item.validUntil) : null,
    version: item.version ? String(item.version) : null,
    isVectorized: item.isVectorized === true,
    vectorizationError: item.vectorizationError
      ? String(item.vectorizationError)
      : null,
    isFeatured: item.isFeatured === true,
    viewCount: toNumber(item.viewCount),
    assignmentsCount: toNumber(item.assignmentsCount),
    creator: {
      id: String(creator.id ?? ""),
      name: String(creator.name ?? "Autore sconosciuto"),
      email: String(creator.email ?? ""),
    },
  };
}

export function mapSkillMarketplacePage(raw: unknown): SkillMarketplacePage {
  const page = extractObject(raw, "marketplace");
  const items = Array.isArray(page?.items)
    ? page.items.map(mapSkillMarketplaceItem)
    : [];
  return {
    items,
    total: toNumber(page?.total),
    page: toNumber(page?.page) || 1,
    limit: toNumber(page?.limit) || PAGE_SIZE,
    hasNextPage: page?.hasNextPage === true,
  };
}

export function mapSkillMarketplaceItem(raw: unknown): SkillMarketplaceItem {
  const item = (raw ?? {}) as Record<string, unknown>;
  const creator = (item.creator ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    workspaceId: String(item.workspaceId ?? ""),
    name: String(item.name ?? ""),
    description: item.description ? String(item.description) : null,
    instructions: String(item.instructions ?? ""),
    sourceRuleId: item.sourceRuleId ? String(item.sourceRuleId) : null,
    sourceRuleName: item.sourceRuleName ? String(item.sourceRuleName) : null,
    isFeatured: item.isFeatured === true,
    viewCount: toNumber(item.viewCount),
    creator: {
      id: String(creator.id ?? ""),
      name: String(creator.name ?? "Autore sconosciuto"),
      email: String(creator.email ?? ""),
    },
  };
}

export function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
