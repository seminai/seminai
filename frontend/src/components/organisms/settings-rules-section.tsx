import { useNavigate } from "@tanstack/react-router";
import { Store, UserRoundCog } from "lucide-react";
import { SettingsRuleDetail } from "@/components/organisms/settings-rule-detail";
import { RulesMarketplaceTab } from "@/components/organisms/rules-marketplace-tab";
import { WorkspaceRulesList } from "@/components/organisms/workspace-rules-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

interface SettingsRulesSectionProps {
  readonly ruleId?: string;
}

export function SettingsRulesSection({ ruleId }: SettingsRulesSectionProps) {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const isDefault = activeWorkspaceId === "seminai-default";
  if (isDefault) return <DefaultWorkspaceNotice />;

  const goToRule = (id: string) => {
    void navigate({
      to: "/settings",
      search: { section: "rules", ruleId: id },
    });
  };

  const goToList = () => {
    void navigate({ to: "/settings", search: { section: "rules" } });
  };

  if (ruleId) return <SettingsRuleDetail ruleId={ruleId} onBack={goToList} />;

  return (
    <div className="p-5">
      <Tabs defaultValue="mine" className="gap-4">
        <TabsList>
          <TabsTrigger value="mine">
            <UserRoundCog className="h-4 w-4" />
            Le mie regole
          </TabsTrigger>
          <TabsTrigger value="marketplace">
            <Store className="h-4 w-4" />
            Marketplace
          </TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <WorkspaceRulesList
            onOpenRule={goToRule}
            onCreateRule={() => goToRule("new")}
          />
        </TabsContent>
        <TabsContent value="marketplace">
          <RulesMarketplaceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DefaultWorkspaceNotice() {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-5 text-sm text-muted-foreground">
      Il workspace Seminai e l'ambiente di default e non puo essere configurato.
      Seleziona un altro workspace.
    </div>
  );
}
