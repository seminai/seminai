import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspacesWorkspaceIdRulesQueryKey,
  useDeleteRulesId,
  useGetWorkspacesWorkspaceIdRules,
} from "@/generated/api/rules/rules";
import {
  RULE_CATEGORY_LABELS,
  RULE_STATUS_LABELS,
} from "@/constants/rule-labels";
import { useWorkspace } from "@/hooks/use-workspace";
import { extractArray } from "@/lib/api-response";
import { customFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Rule, RuleCategory, RuleStatus } from "@/types/workspace";

const STATUS_VARIANT: Record<
  RuleStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  ACTIVE: "default",
  ARCHIVED: "secondary",
  DEPRECATED: "destructive",
} as const;

interface WorkspaceRulesListProps {
  readonly onOpenRule: (id: string) => void;
  readonly onCreateRule: () => void;
}

export function WorkspaceRulesList({
  onOpenRule,
  onCreateRule,
}: WorkspaceRulesListProps) {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const rulesQuery = useGetWorkspacesWorkspaceIdRules(
    activeWorkspaceId,
    search ? { search } : undefined,
  );
  const deleteMutation = useDeleteRulesId();
  const rules = extractArray(rulesQuery.data?.data, "rules").map(mapRule);

  const invalidateRules = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetWorkspacesWorkspaceIdRulesQueryKey(activeWorkspaceId),
    });
  };

  const handleDelete = (event: React.MouseEvent, ruleId: string) => {
    event.stopPropagation();
    if (!window.confirm("Vuoi eliminare questa regola?")) return;
    deleteMutation.mutate({ id: ruleId }, { onSuccess: invalidateRules });
  };

  const handleStatusChange = (
    event: React.MouseEvent,
    ruleId: string,
    status: RuleStatus,
  ) => {
    event.stopPropagation();
    void updateRuleStatus(ruleId, status).then(invalidateRules);
  };

  return (
    <div className="space-y-4">
      <ListHeader onCreateRule={onCreateRule} />
      <SearchBox value={search} onChange={setSearch} />
      <RuleListState
        isLoading={rulesQuery.isLoading}
        rules={rules}
        onOpenRule={onOpenRule}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}

function ListHeader({ onCreateRule }: { readonly onCreateRule: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">Regole</h2>
      <Button size="sm" onClick={onCreateRule}>
        <Plus className="h-4 w-4" />
        Nuova regola
      </Button>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cerca regole..."
        className="h-8 pl-8 text-sm"
      />
    </div>
  );
}

function RuleListState({
  isLoading,
  rules,
  onOpenRule,
  onDelete,
  onStatusChange,
  isDeleting,
}: {
  readonly isLoading: boolean;
  readonly rules: readonly Rule[];
  readonly onOpenRule: (id: string) => void;
  readonly onDelete: (event: React.MouseEvent, ruleId: string) => void;
  readonly onStatusChange: (
    event: React.MouseEvent,
    ruleId: string,
    status: RuleStatus,
  ) => void;
  readonly isDeleting: boolean;
}) {
  if (isLoading) return <EmptyState label="Caricamento regole..." />;
  if (rules.length === 0) return <EmptyState label="Nessuna regola trovata" />;
  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          onOpenRule={onOpenRule}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  onOpenRule,
  onDelete,
  onStatusChange,
  isDeleting,
}: {
  readonly rule: Rule;
  readonly onOpenRule: (id: string) => void;
  readonly onDelete: (event: React.MouseEvent, ruleId: string) => void;
  readonly onStatusChange: (
    event: React.MouseEvent,
    ruleId: string,
    status: RuleStatus,
  ) => void;
  readonly isDeleting: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenRule(rule.id)}
      className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{rule.name}</p>
        {rule.description && (
          <p className="truncate text-xs text-muted-foreground">
            {rule.description}
          </p>
        )}
      </div>
      <Badge variant={STATUS_VARIANT[rule.status]}>
        {RULE_STATUS_LABELS[rule.status]}
      </Badge>
      <span className="shrink-0 text-xs text-muted-foreground">
        {RULE_CATEGORY_LABELS[rule.category]}
      </span>
      <StatusToggle
        currentStatus={rule.status}
        onChange={(event, status) => onStatusChange(event, rule.id, status)}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-destructive hover:text-destructive"
        onClick={(event) => onDelete(event, rule.id)}
        disabled={isDeleting}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </button>
  );
}

function StatusToggle({
  currentStatus,
  onChange,
}: {
  readonly currentStatus: RuleStatus;
  readonly onChange: (event: React.MouseEvent, status: RuleStatus) => void;
}) {
  const nextStatus: RuleStatus =
    currentStatus === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  const label = currentStatus === "ACTIVE" ? "Archivia" : "Attiva";
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={(e) => onChange(e, nextStatus)}
    >
      {label}
    </Button>
  );
}

function EmptyState({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

async function updateRuleStatus(ruleId: string, status: RuleStatus) {
  return customFetch(`/rules/${ruleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

function mapRule(raw: Record<string, unknown>): Rule {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    slug: raw.slug ? String(raw.slug) : null,
    description: raw.description ? String(raw.description) : null,
    category: (raw.category as RuleCategory) ?? "STANDARD",
    status: (raw.status as RuleStatus) ?? "DRAFT",
    region: raw.region ? String(raw.region) : null,
    isPublic: Boolean(raw.isPublic),
    isTemplate: Boolean(raw.isTemplate),
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}
