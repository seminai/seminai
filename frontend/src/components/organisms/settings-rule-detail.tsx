import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspacesWorkspaceIdRulesQueryKey,
  usePostWorkspacesWorkspaceIdRules,
} from "@/generated/api/rules/rules";
import {
  useGetRulesId,
  useDeleteRulesId,
  getGetRulesIdQueryKey,
} from "@/generated/api/rules/rules";
import { useUpdateRule } from "@/hooks/use-update-rule";
import { useWorkspace } from "@/hooks/use-workspace";
import { extractObject } from "@/lib/api-response";
import { mapRawRuleDetail } from "@/lib/rule-detail-mapper";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RuleCompanyAssignment } from "@/components/molecules/rule-company-assignment";
import { RuleContentEditor } from "@/components/molecules/rule-content-editor";
import {
  RuleBackButton,
  RuleStateMessage,
} from "@/components/molecules/rule-detail-nav";
import {
  RuleFormFields,
  type RuleFormValues,
} from "@/components/molecules/rule-form-fields";
import { RulePdfField } from "@/components/molecules/rule-pdf-field";
import { RuleVectorizationPanel } from "@/components/organisms/rule-vectorization-panel";
import type { RuleCategory } from "@/types/workspace";

interface RuleDetailProps {
  readonly ruleId: string;
  readonly onBack: () => void;
}

export function SettingsRuleDetail({ ruleId, onBack }: RuleDetailProps) {
  return ruleId === "new" ? (
    <CreateRuleView onBack={onBack} />
  ) : (
    <EditRuleView ruleId={ruleId} onBack={onBack} />
  );
}

/* ── Create ── */

function CreateRuleView({ onBack }: { readonly onBack: () => void }) {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [contentJson, setContentJson] = useState(
    '{"sezioni":[],"requisiti":[]}',
  );
  const createMutation = usePostWorkspacesWorkspaceIdRules();

  const form = useForm<RuleFormValues>({
    defaultValues: {
      name: "",
      description: "",
      category: "STANDARD",
      region: "",
      isPublic: false,
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    createMutation.mutate(
      {
        workspaceId: activeWorkspaceId,
        data: {
          name: data.name,
          description: data.description || undefined,
          category: data.category as RuleCategory,
          content: contentJson,
          region: data.region || undefined,
          isPublic: data.isPublic,
          pdfFile: pdfFile ?? undefined,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getGetWorkspacesWorkspaceIdRulesQueryKey(activeWorkspaceId),
          });
          onBack();
        },
      },
    );
  });

  return (
    <div className="space-y-6 p-5">
      <RuleBackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Nuova regola</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <RuleFormFields form={form} />
        <RuleContentEditor value={contentJson} onChange={setContentJson} />
        <RulePdfField
          fileInputRef={fileInputRef}
          currentFile={pdfFile}
          onFileChange={setPdfFile}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            Annulla
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crea regola
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ── Edit ── */

function EditRuleView({
  ruleId,
  onBack,
}: {
  readonly ruleId: string;
  readonly onBack: () => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newPdf, setNewPdf] = useState<File | null>(null);

  const ruleQuery = useGetRulesId(ruleId);
  const updateMutation = useUpdateRule();
  const deleteMutation = useDeleteRulesId();

  const raw = extractObject(ruleQuery.data?.data, "rule");
  const rule = raw ? mapRawRuleDetail(raw) : null;

  const ruleContentStr = rule
    ? typeof rule.content === "string"
      ? rule.content
      : JSON.stringify(rule.content)
    : '{"sezioni":[],"requisiti":[]}';

  const [contentJson, setContentJson] = useState(ruleContentStr);
  const [contentDirty, setContentDirty] = useState(false);

  // Reset content state when API data changes (key-based via ruleContentStr)
  if (!contentDirty && contentJson !== ruleContentStr) {
    setContentJson(ruleContentStr);
  }

  const handleContentChange = (json: string) => {
    setContentJson(json);
    setContentDirty(true);
  };

  const form = useForm<RuleFormValues>({
    values: rule
      ? {
          name: rule.name,
          description: rule.description ?? "",
          category: rule.category,
          status: rule.status,
          region: rule.region ?? "",
          isPublic: rule.isPublic,
        }
      : undefined,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetRulesIdQueryKey(ruleId),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetWorkspacesWorkspaceIdRulesQueryKey(activeWorkspaceId),
    });
  };

  const onSave = form.handleSubmit((data) => {
    updateMutation.mutate(
      {
        id: ruleId,
        data: {
          name: data.name,
          description: data.description || undefined,
          category: data.category,
          status: data.status,
          content: contentJson,
          region: data.region || undefined,
          isPublic: data.isPublic,
          pdfFile: newPdf ?? undefined,
        },
      },
      { onSuccess: invalidate },
    );
  });

  const onDelete = () => {
    if (!window.confirm("Vuoi eliminare questa regola?")) return;
    deleteMutation.mutate(
      { id: ruleId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getGetWorkspacesWorkspaceIdRulesQueryKey(activeWorkspaceId),
          });
          onBack();
        },
      },
    );
  };

  if (ruleQuery.isLoading) return <RuleStateMessage label="Caricamento..." />;
  if (!rule) return <RuleStateMessage label="Regola non trovata." />;

  const canSave = form.formState.isDirty || contentDirty || !!newPdf;

  return (
    <div className="space-y-6 p-5">
      <RuleBackButton onClick={onBack} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Modifica regola</h2>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" /> Elimina
        </Button>
      </div>

      <form onSubmit={onSave} className="space-y-4">
        <RuleFormFields form={form} showStatus />
        <RuleContentEditor value={contentJson} onChange={handleContentChange} />
        <RulePdfField
          fileInputRef={fileInputRef}
          existingUrl={rule.pdfFileUrl}
          existingName={rule.pdfFileName}
          currentFile={newPdf}
          onFileChange={setNewPdf}
        />
        <RuleVectorizationPanel
          ruleId={ruleId}
          hasPdf={Boolean(rule.pdfFileUrl)}
          isVectorized={rule.isVectorized}
          vectorizedAt={rule.vectorizedAt}
          vectorizationError={rule.vectorizationError}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending || !canSave}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salva
          </Button>
        </div>
      </form>

      <Separator />
      <RuleCompanyAssignment ruleId={ruleId} />
    </div>
  );
}
