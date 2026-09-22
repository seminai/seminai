import { useState } from "react";
import { Search, Sparkles, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useQueryClient } from "@tanstack/react-query";
import type { RuleCategory } from "@/types/workspace";
import type {
  RuleMarketplaceItem,
} from "@/types/rule-marketplace";
import {
  getGetWorkspacesWorkspaceIdRulesQueryKey,
  useGetRulesMarketplace,
  usePostWorkspacesWorkspaceIdRulesFromPublicRuleId,
} from "@/generated/api/rules/rules";
import { toast } from "sonner";
import { RULE_CATEGORY_OPTIONS } from "@/constants/rule-labels";
import { RulesMarketplacePager } from "@/components/molecules/rules-marketplace-pager";
import { PublicRuleAssignmentDialog } from "@/components/molecules/public-rule-assignment-dialog";
import { FilterInput, RuleMarketplaceList, SkillsMarketplacePanel, mapRuleMarketplacePage } from './rules-marketplace-tab.part-02-skills-marketplace-panel';

export const PAGE_SIZE = 20;

export type MarketplaceType = "rules" | "skills";

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

export function MarketplaceHeader({
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

export function TypeToggleButton({
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

export function SharedFilters({
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

export function RulesMarketplacePanel({
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
