import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { usePostRulesIdCompanies } from "@/generated/api/rules/rules";
import { useCompanyOptions } from "@/hooks/use-company-options";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/molecules/searchable-select";

interface PublicRuleAssignmentDialogProps {
  readonly ruleId: string | null;
  readonly ruleName: string;
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function PublicRuleAssignmentDialog({
  ruleId,
  ruleName,
  workspaceId,
  open,
  onOpenChange,
}: PublicRuleAssignmentDialogProps) {
  const { companies } = useCompanyOptions();
  const [companyId, setCompanyId] = useState("");
  const assignMutation = usePostRulesIdCompanies({
    mutation: {
      onSuccess: () => {
        toast.success("Regola assegnata all'azienda");
        setCompanyId("");
        onOpenChange(false);
      },
      onError: () => toast.error("Impossibile assegnare la regola"),
    },
  });

  const handleAssign = () => {
    if (!ruleId || !companyId) return;
    assignMutation.mutate({ id: ruleId, data: { companyId, workspaceId } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usa rule pubblica</DialogTitle>
          <DialogDescription>
            Assegna "{ruleName}" a una delle aziende accessibili.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Azienda</Label>
          <SearchableSelect
            value={companyId}
            options={companies}
            placeholder="Seleziona azienda..."
            searchPlaceholder="Cerca azienda..."
            emptyMessage="Nessuna azienda disponibile."
            onChange={(value) => setCompanyId(value ?? "")}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={!companyId || assignMutation.isPending}
            onClick={handleAssign}
          >
            {assignMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Assegna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
