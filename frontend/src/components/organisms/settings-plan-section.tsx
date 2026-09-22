import { useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { useGetWorkspacesId } from '@/generated/api/workspaces/workspaces';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAuth } from '@/hooks/use-auth';
import { customFetch } from '@/lib/api-client';
import { extractObject } from '@/lib/api-response';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  PLAN_DEFINITIONS,
  getPlanLabel,
  type WorkspacePlan,
  type PlanInfo,
} from '@/types/workspace';

export function SettingsPlanSection() {
  const { activeWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const isDefault = activeWorkspaceId === 'seminai-default';

  const workspaceQuery = useGetWorkspacesId(activeWorkspaceId, {
    query: { enabled: !isDefault },
  });

  const raw = extractObject(workspaceQuery.data?.data, 'workspace');
  const currentPlan: WorkspacePlan = (raw?.plan as WorkspacePlan) ?? 'FREE';
  const workspaceName = raw?.name ? String(raw.name) : '';

  const [selectedPlan, setSelectedPlan] = useState<WorkspacePlan | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestPlan = async () => {
    if (!selectedPlan || !user) return;
    setSending(true);
    setError(null);

    const body = [
      `RICHIESTA CAMBIO PIANO`,
      ``,
      `Utente: ${user.name} (${user.email})`,
      `Workspace: ${workspaceName} (${activeWorkspaceId})`,
      `Piano attuale: ${getPlanLabel(currentPlan)}`,
      `Piano richiesto: ${getPlanLabel(selectedPlan)}`,
      note.trim() ? `\nNota: ${note.trim()}` : '',
    ].join('\n');

    try {
      await customFetch({
        url: '/email/send-email',
        method: 'POST',
        data: { name: user.name, email: user.email, body },
      });
      setSent(true);
      setSelectedPlan(null);
      setNote('');
    } catch {
      setError('Errore durante l\'invio della richiesta. Riprova più tardi.');
    } finally {
      setSending(false);
    }
  };

  if (isDefault) {
    return <SectionState label="Seleziona un workspace per gestire il piano." />;
  }
  if (workspaceQuery.isLoading) return <SectionState label="Caricamento..." />;
  if (workspaceQuery.isError) return <SectionState label="Errore durante il caricamento." />;

  return (
    <div className="space-y-6 p-5">
      <div>
        <h2 className="text-lg font-semibold">Piano</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Il tuo workspace è attualmente sul piano{' '}
          <span className="font-medium text-foreground">{getPlanLabel(currentPlan)}</span>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_DEFINITIONS.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            isCurrent={plan.key === currentPlan}
            isSelected={plan.key === selectedPlan}
            onSelect={() => setSelectedPlan(plan.key)}
          />
        ))}
      </div>

      {selectedPlan && selectedPlan !== currentPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Richiedi passaggio a {getPlanLabel(selectedPlan)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan-note">Nota aggiuntiva (opzionale)</Label>
              <Textarea
                id="plan-note"
                placeholder="Aggiungi dettagli sulla richiesta..."
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={handleRequestPlan} disabled={sending} className="w-full">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? 'Invio in corso...' : 'Invia richiesta'}
            </Button>
          </CardContent>
        </Card>
      )}

      {sent && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <Check className="h-4 w-4 shrink-0" />
          Richiesta inviata con successo! Ti contatteremo a breve per confermare il cambio piano.
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  isSelected,
  onSelect,
}: {
  readonly plan: PlanInfo;
  readonly isCurrent: boolean;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}) {
  const canSelect = !isCurrent;

  return (
    <Card
      className={cn(
        'relative cursor-pointer transition-shadow',
        isSelected && 'ring-2 ring-primary',
        isCurrent && 'border-primary/50 bg-primary/5',
        !canSelect && 'cursor-default',
      )}
      onClick={canSelect ? onSelect : undefined}
    >
      {isCurrent && (
        <span className="absolute top-3 right-3 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Attivo
        </span>
      )}
      <CardHeader>
        <CardTitle className="text-base">{plan.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
        {canSelect && (
          <Button variant={isSelected ? 'default' : 'outline'} size="sm" className="w-full">
            {isSelected ? 'Selezionato' : 'Seleziona'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SectionState({ label }: { readonly label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
