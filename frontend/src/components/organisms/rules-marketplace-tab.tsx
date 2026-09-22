import { useState } from "react";
import { Search, Sparkles, Store } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetWorkspacesWorkspaceIdRulesQueryKey,
  useGetRulesMarketplace,
  usePostWorkspacesWorkspaceIdRulesFromPublicRuleId,
} from "@/generated/api/rules/rules";
import {
  getGetWorkspacesWorkspaceIdSkillsQueryKey,
  useGetSkillsMarketplace,
  usePostWorkspacesWorkspaceIdSkillsFromPublicSkillId,
} from "@/generated/api/skills/skills";
import { RULE_CATEGORY_OPTIONS } from "@/constants/rule-labels";
import { useWorkspace } from "@/hooks/use-workspace";
import { extractObject } from "@/lib/api-response";
import { Input } from "@/components/ui/input";
import { PublicRuleAssignmentDialog } from "@/components/molecules/public-rule-assignment-dialog";
import { RuleMarketplaceCard } from "@/components/molecules/rule-marketplace-card";
import { SkillMarketplaceCard } from "@/components/molecules/skill-marketplace-card";
import { RulesMarketplacePager } from "@/components/molecules/rules-marketplace-pager";
import { cn } from "@/lib/utils";
import type { RuleCategory } from "@/types/workspace";
import type {
  RuleMarketplaceItem,
  RuleMarketplacePage,
} from "@/types/rule-marketplace";
import type {
  SkillMarketplaceItem,
  SkillMarketplacePage,
} from "@/types/skill-marketplace";

const PAGE_SIZE = 20;
type MarketplaceType = "rules" | "skills";

export function RulesMarketplaceTab() {
  const [marketplaceType, setMarketplaceType] =
    useState<MarketplaceType>("rules");
  const [search, setSearch] = useState("");
  const [creator, setCreator] = useState("");
  const [page, setPage] = useState(1);

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-4">
      <MarketplaceHeader
        marketplaceType={marketplaceType}
        onChangeType={(type) => {
          setMarketplaceType(type);
          setPage(1);
        }}
      />
      <SharedFilters
        search={search}
        creator={creator}
        onSearch={(v) => {
          setSearch(v);
          resetPage();
        }}
        onCreator={(v) => {
          setCreator(v);
          resetPage();
        }}
      />
      {marketplaceType === "rules" ? (
        <RulesMarketplacePanel
          search={search}
          creator={creator}
          page={page}
          onPageChange={setPage}
        />
      ) : (
        <SkillsMarketplacePanel
          search={search}
          creator={creator}
          page={page}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function MarketplaceHeader({
  marketplaceType,
  onChangeType,
}: {
  readonly marketplaceType: MarketplaceType;
  readonly onChangeType: (type: MarketplaceType) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Marketplace rules & skills</h2>
        <p className="text-sm text-muted-foreground">
          Regole e skill AI pubblici condivisi dalla community e dal team
          Seminai.
        </p>
      </div>
      <div className="inline-flex rounded-md border bg-muted/20 p-1">
        <TypeToggleButton
          active={marketplaceType === "rules"}
          icon={<Store className="h-3.5 w-3.5" />}
          label="Rules"
          onClick={() => onChangeType("rules")}
        />
        <TypeToggleButton
          active={marketplaceType === "skills"}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Skills"
          onClick={() => onChangeType("skills")}
        />
      </div>
    </div>
  );
}

function TypeToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SharedFilters({
  search,
  creator,
  onSearch,
  onCreator,
}: {
  readonly search: string;
  readonly creator: string;
  readonly onSearch: (value: string) => void;
  readonly onCreator: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1.4fr_0.9fr]">
      <FilterInput
        icon={<Search />}
        value={search}
        placeholder="Cerca..."
        onChange={onSearch}
      />
      <FilterInput
        value={creator}
        placeholder="Autore"
        onChange={onCreator}
      />
    </div>
  );
}

function RulesMarketplacePanel({
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
  const [category, setCategory] = useState<RuleCategory | "">("");
  const [region, setRegion] = useState("");
  const [selectedRule, setSelectedRule] = useState<RuleMarketplaceItem | null>(
    null,
  );
  const marketplaceQuery = useGetRulesMarketplace({
    search: search || undefined,
    category: category || undefined,
    region: region || undefined,
    creator: creator || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const duplicateMutation = usePostWorkspacesWorkspaceIdRulesFromPublicRuleId({
    mutation: {
      onSuccess: () => {
        toast.success("Rule duplicata come bozza privata");
        void queryClient.invalidateQueries({
          queryKey: getGetWorkspacesWorkspaceIdRulesQueryKey(activeWorkspaceId),
        });
      },
      onError: () => toast.error("Impossibile duplicare la rule"),
    },
  });
  const marketplace = mapRuleMarketplacePage(marketplaceQuery.data?.data);

  return (
    <>
      <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as RuleCategory | "");
            onPageChange(1);
          }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Tutte le categorie</option>
          {RULE_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FilterInput
          value={region}
          placeholder="Regione"
          onChange={(v) => {
            setRegion(v);
            onPageChange(1);
          }}
        />
      </div>
      <RuleMarketplaceList
        isLoading={marketplaceQuery.isLoading}
        marketplace={marketplace}
        duplicatingRuleId={duplicateMutation.variables?.ruleId ?? null}
        isDuplicating={duplicateMutation.isPending}
        onUseRule={setSelectedRule}
        onDuplicate={(ruleId) =>
          duplicateMutation.mutate({ workspaceId: activeWorkspaceId, ruleId })
        }
      />
      <RulesMarketplacePager
        page={page}
        marketplace={marketplace}
        pageSize={PAGE_SIZE}
        onPageChange={onPageChange}
      />
      <PublicRuleAssignmentDialog
        ruleId={selectedRule?.id ?? null}
        ruleName={selectedRule?.name ?? ""}
        workspaceId={activeWorkspaceId}
        open={selectedRule !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRule(null);
        }}
      />
    </>
  );
}

function SkillsMarketplacePanel({
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

function FilterInput({
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

function RuleMarketplaceList({
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

function SkillMarketplaceList({
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

function EmptyState({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function mapRuleMarketplacePage(raw: unknown): RuleMarketplacePage {
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

function mapRuleMarketplaceItem(raw: unknown): RuleMarketplaceItem {
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

function mapSkillMarketplacePage(raw: unknown): SkillMarketplacePage {
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

function mapSkillMarketplaceItem(raw: unknown): SkillMarketplaceItem {
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

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
