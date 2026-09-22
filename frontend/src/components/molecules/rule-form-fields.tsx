import type { UseFormReturn } from "react-hook-form";
import { RULE_CATEGORY_OPTIONS } from "@/constants/rule-labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RuleCategory, RuleStatus } from "@/types/workspace";

const STATUSES: ReadonlyArray<{
  readonly value: RuleStatus;
  readonly label: string;
}> = [
  { value: "DRAFT", label: "Bozza" },
  { value: "ACTIVE", label: "Attiva" },
  { value: "ARCHIVED", label: "Archiviata" },
  { value: "DEPRECATED", label: "Deprecata" },
];

export interface RuleFormValues {
  readonly name: string;
  readonly description: string;
  readonly category: RuleCategory;
  readonly status?: RuleStatus;
  readonly region: string;
  readonly isPublic: boolean;
}

export function RuleFormFields({
  form,
  showStatus,
}: {
  readonly form: UseFormReturn<RuleFormValues>;
  readonly showStatus?: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input {...form.register("name", { required: true })} />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <select
            {...form.register("category")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {RULE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {showStatus && (
          <div className="space-y-1.5">
            <Label>Stato</Label>
            <select
              {...form.register("status")}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Regione</Label>
          <Input
            {...form.register("region")}
            placeholder="es. Emilia-Romagna"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2">
        <div className="space-y-0.5">
          <Label>Pubblica nel marketplace</Label>
          <p className="text-xs text-muted-foreground">
            Visibile agli altri utenti quando lo stato e Attiva.
          </p>
        </div>
        <Switch
          checked={form.watch("isPublic")}
          onCheckedChange={(checked) =>
            form.setValue("isPublic", checked, { shouldDirty: true })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label>Descrizione</Label>
        <Textarea
          {...form.register("description")}
          rows={3}
          placeholder="Descrizione della regola..."
        />
      </div>
    </>
  );
}
