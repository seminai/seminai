import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRulesIdCompanies,
  usePostRulesIdCompanies,
  useDeleteRulesIdCompaniesCompanyId,
  getGetRulesIdCompaniesQueryKey,
} from "@/generated/api/rules/rules";
import { useCompanyOptions } from "@/hooks/use-company-options";
import { useWorkspace } from "@/hooks/use-workspace";
import { extractArray } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/molecules/searchable-select";

interface RuleCompanyAssignmentProps {
  readonly ruleId: string;
}

export function RuleCompanyAssignment({ ruleId }: RuleCompanyAssignmentProps) {
  const queryClient = useQueryClient();
  const { companies: companyOptions } = useCompanyOptions();
  const { activeWorkspaceId } = useWorkspace();
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const assignmentsQuery = useGetRulesIdCompanies(ruleId);
  const assignMutation = usePostRulesIdCompanies();
  const unassignMutation = useDeleteRulesIdCompaniesCompanyId();

  const rawAssignments = extractArray(
    assignmentsQuery.data?.data,
    "assignments",
    "companies",
  );
  const assigned = rawAssignments.map((a) => ({
    companyId: String(
      a.companyId ?? (a.company as Record<string, unknown>)?.id ?? "",
    ),
    companyName: String(
      a.companyName ??
        (a.company as Record<string, unknown>)?.name ??
        "Azienda",
    ),
    notes: a.notes ? String(a.notes) : null,
  }));

  const assignedIds = new Set(assigned.map((a) => a.companyId));
  const availableCompanies = companyOptions.filter(
    (c) => !assignedIds.has(c.value),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetRulesIdCompaniesQueryKey(ruleId),
    });
  };

  const handleAssign = () => {
    if (!selectedCompanyId) return;
    assignMutation.mutate(
      {
        id: ruleId,
        data: { companyId: selectedCompanyId, workspaceId: activeWorkspaceId },
      },
      {
        onSuccess: () => {
          setSelectedCompanyId("");
          invalidate();
        },
      },
    );
  };

  const handleUnassign = (companyId: string) => {
    unassignMutation.mutate(
      { id: ruleId, companyId },
      { onSuccess: invalidate },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Aziende assegnate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna azienda assegnata.
          </p>
        ) : (
          <div className="space-y-2">
            {assigned.map((a) => (
              <div
                key={a.companyId}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.companyName}
                </span>
                {a.notes && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {a.notes}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => handleUnassign(a.companyId)}
                  disabled={unassignMutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label className="mb-1.5 block text-xs">Aggiungi azienda</Label>
            <SearchableSelect
              value={selectedCompanyId}
              options={availableCompanies}
              placeholder="Seleziona azienda..."
              searchPlaceholder="Cerca azienda..."
              emptyMessage="Nessuna azienda disponibile."
              onChange={(v) => setSelectedCompanyId(v ?? "")}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!selectedCompanyId || assignMutation.isPending}
            onClick={handleAssign}
          >
            {assignMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Assegna
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
