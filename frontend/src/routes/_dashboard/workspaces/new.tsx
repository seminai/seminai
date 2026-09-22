import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  usePostWorkspaces,
  getGetWorkspacesQueryKey,
} from '@/generated/api/workspaces/workspaces';
import { extractObject } from '@/lib/api-response';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceKindSelector } from '@/components/molecules/workspace-kind-selector';
import { WorkspaceCompanyPicker } from '@/components/molecules/workspace-company-picker';
import { useCompanies } from '@/hooks/use-company-options';
import type { WorkspaceKind } from '@/types/workspace';
import type { PostWorkspacesBodyEnabledModulesItem } from '@/generated/schemas';

const LABEL_MODULE_ROLES = ['ADMIN', 'GOD', 'LABEL_MANAGER'] as const;

interface CreateWorkspaceFormValues {
  readonly name: string;
  readonly kind: WorkspaceKind;
  readonly slug: string;
  readonly description: string;
  readonly enableLabels: boolean;
  readonly companyIds: readonly string[];
}

export const Route = createFileRoute('/_dashboard/workspaces/new')({
  component: CreateWorkspacePage,
});

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function CreateWorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setActiveWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const canEnableLabels = user ? (LABEL_MODULE_ROLES as readonly string[]).includes(user.role) : false;
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateWorkspaceFormValues>({
    defaultValues: {
      name: '',
      kind: 'AGRICULTURAL',
      slug: '',
      description: '',
      enableLabels: false,
      companyIds: [],
    },
  });
  const nameValue = form.watch('name');
  const slugValue = form.watch('slug');
  const enableLabels = form.watch('enableLabels');
  const selectedKind = form.watch('kind');
  const selectedCompanyIds = form.watch('companyIds');
  const { companies: allCompanies } = useCompanies({ scope: 'all' });

  useEffect(() => {
    const allowedIds = new Set(
      allCompanies.filter((company) => company.kind === selectedKind).map((company) => company.id),
    );
    const nextIds = selectedCompanyIds.filter((id) => allowedIds.has(id));
    if (nextIds.length !== selectedCompanyIds.length) {
      form.setValue('companyIds', nextIds);
    }
  }, [allCompanies, form, selectedCompanyIds, selectedKind]);
  const effectiveSlug = slugValue.trim().length > 0 ? slugify(slugValue) : slugify(nameValue);
  const isAgricultural = selectedKind === 'AGRICULTURAL';
  const showModulesSection = isAgricultural || canEnableLabels;

  const createMutation = usePostWorkspaces({
    mutation: {
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() });
        const created = extractObject(response.data, 'workspace') as { id?: string } | null;
        if (created?.id) setActiveWorkspaceId(created.id);
        void navigate({ to: '/home' });
      },
      onError: (error) => {
        const message =
          error instanceof ApiError && error.body?.message
            ? error.body.message
            : 'Impossibile creare il workspace. Riprova.';
        setServerError(message);
      },
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const trimmedName = values.name.trim();
    if (!trimmedName) {
      form.setError('name', { message: 'Il nome è obbligatorio' });
      return;
    }
    setServerError(null);
    const trimmedSlug = values.slug.trim();
    const trimmedDescription = values.description.trim();
    const enabledModules: PostWorkspacesBodyEnabledModulesItem[] =
      values.enableLabels && canEnableLabels ? ['DCA', 'LABELS'] : ['DCA'];
    createMutation.mutate({
      data: {
        name: trimmedName,
        kind: values.kind,
        enabledModules,
        ...(trimmedSlug.length > 0 ? { slug: slugify(trimmedSlug) } : {}),
        ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
        ...(values.companyIds.length > 0 ? { companyIds: [...values.companyIds] } : {}),
      },
    });
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => void navigate({ to: '/home' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Torna indietro
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Crea un nuovo workspace</h1>
        <p className="text-sm text-muted-foreground">
          Un workspace è un ambiente isolato dove inviti collaboratori, aziende e configuri regole
          condivise. Scegli il tipo in base al settore: determina chat e archivio disponibili.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dettagli del workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Es. Azienda Agricola Rossi"
                autoFocus
                {...form.register('name', { required: true })}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message ?? 'Campo obbligatorio'}
                </p>
              )}
            </div>

            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <WorkspaceKindSelector
                  value={field.value}
                  onChange={field.onChange}
                  disabled={createMutation.isPending}
                />
              )}
            />

            <WorkspaceCompanyPicker
              kind={selectedKind}
              selectedIds={selectedCompanyIds}
              onChange={(ids) => form.setValue('companyIds', ids)}
              disabled={createMutation.isPending}
            />

            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder={effectiveSlug || 'generato-automaticamente'}
                {...form.register('slug')}
              />
              <p className="text-xs text-muted-foreground">
                Identificatore URL-friendly. Se lasciato vuoto verrà generato dal nome.
                {effectiveSlug && (
                  <>
                    {' '}
                    Anteprima:{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{effectiveSlug}</code>
                  </>
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="Opzionale: a cosa serve questo workspace?"
                {...form.register('description')}
              />
            </div>

            {showModulesSection && (
              <div className="space-y-2">
                <Label>Moduli</Label>
                {isAgricultural && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="module-dca" checked disabled aria-label="DCA" />
                    <Label htmlFor="module-dca" className="font-normal">
                      DCA — Documenti e dati agricoli{' '}
                      <span className="text-xs text-muted-foreground">(sempre incluso)</span>
                    </Label>
                  </div>
                )}
                {canEnableLabels && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="module-labels"
                      checked={enableLabels}
                      onCheckedChange={(checked) => form.setValue('enableLabels', checked === true)}
                      aria-label="Etichette"
                    />
                    <Label htmlFor="module-labels" className="font-normal">
                      Etichette — Registro etichette prodotto
                    </Label>
                  </div>
                )}
              </div>
            )}

            {serverError && (
              <p
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {serverError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void navigate({ to: '/home' })}
                disabled={createMutation.isPending}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Crea workspace
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
