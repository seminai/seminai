import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Camera, Loader2, Save, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  getGetWorkspacesQueryKey,
  getGetWorkspacesIdQueryKey,
  useGetWorkspacesId,
  useDeleteWorkspacesId,
  usePostWorkspacesIdLogo,
} from '@/generated/api/workspaces/workspaces';
import { useUpdateWorkspace } from '@/hooks/use-update-workspace';
import { useWorkspace } from '@/hooks/use-workspace';
import { extractArray, extractObject } from '@/lib/api-response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isWorkspaceModule, parseWorkspaceKind, WORKSPACE_KIND_LABELS, type WorkspaceDetail, type WorkspacePlan } from '@/types/workspace';
import { WorkspaceMembersSection } from '@/components/organisms/workspace-members-section';
import { WorkspaceAssignedCompaniesSection } from '@/components/organisms/workspace-assigned-companies-section';

interface GeneralFormValues {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
}

export function SettingsWorkspaceSection() {
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDefault = activeWorkspaceId === 'seminai-default';
  const workspaceQuery = useGetWorkspacesId(activeWorkspaceId, {
    query: { enabled: !isDefault },
  });
  const updateMutation = useUpdateWorkspace();
  const deleteMutation = useDeleteWorkspacesId();
  const uploadLogo = usePostWorkspacesIdLogo();

  const raw = extractObject(workspaceQuery.data?.data, 'workspace');
  const ws: WorkspaceDetail | null = raw
    ? {
        id: String(raw.id ?? ''),
        name: String(raw.name ?? ''),
        slug: String(raw.slug ?? ''),
        description: raw.description ? String(raw.description) : null,
        logoUrl: raw.logoUrl ? String(raw.logoUrl) : null,
        iconUrl: raw.iconUrl ? String(raw.iconUrl) : null,
        primaryColor: raw.primaryColor ? String(raw.primaryColor) : null,
        secondaryColor: raw.secondaryColor ? String(raw.secondaryColor) : null,
        accentColor: raw.accentColor ? String(raw.accentColor) : null,
        kind: parseWorkspaceKind(raw.kind),
        plan: (raw.plan as WorkspacePlan) ?? null,
        enabledModules: extractArray(raw, 'enabledModules').map(String).filter(isWorkspaceModule),
      }
    : null;

  const form = useForm<GeneralFormValues>({
    values: {
      name: ws?.name ?? '',
      slug: ws?.slug ?? '',
      description: ws?.description ?? '',
      primaryColor: ws?.primaryColor ?? '#000000',
      secondaryColor: ws?.secondaryColor ?? '#000000',
      accentColor: ws?.accentColor ?? '#000000',
    },
  });

  const invalidateWorkspace = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetWorkspacesIdQueryKey(activeWorkspaceId),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetWorkspacesQueryKey(),
    });
  };

  const onSave = form.handleSubmit((data) => {
    updateMutation.mutate({ id: activeWorkspaceId, data }, { onSuccess: invalidateWorkspace });
  });

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(
      { id: activeWorkspaceId, data: { logo: file } },
      { onSuccess: invalidateWorkspace },
    );
  };

  const onDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMutation.mutate(
      { id: activeWorkspaceId },
      {
        onSuccess: () => {
          setActiveWorkspaceId('seminai-default');
          void queryClient.invalidateQueries({
            queryKey: getGetWorkspacesQueryKey(),
          });
          void navigate({ to: '/' });
        },
      },
    );
  };

  if (isDefault) {
    return (
      <SectionState label="Il workspace Seminai è l'ambiente di default e non può essere configurato. Seleziona un altro workspace." />
    );
  }

  if (workspaceQuery.isLoading) return <SectionState label="Caricamento workspace..." />;
  if (workspaceQuery.isError) return <SectionState label="Errore durante il caricamento." />;
  if (!ws) return <SectionState label="Nessun dato disponibile." />;

  return (
    <div className="space-y-6 p-5">
      <h2 className="text-lg font-semibold">Impostazioni workspace</h2>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted"
        >
          {ws.logoUrl ? (
            <img src={ws.logoUrl} alt={ws.name} className="h-full w-full object-contain" />
          ) : (
            <span className="text-2xl font-bold text-muted-foreground">
              {ws.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onLogoChange}
        />
        <div className="text-sm text-muted-foreground">
          Clicca per caricare il logo del workspace.
          {uploadLogo.isPending && <span className="ml-2">Caricamento...</span>}
        </div>
      </div>

      {/* General form */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni generali</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo workspace</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium">{WORKSPACE_KIND_LABELS[ws.kind ?? 'AGRICULTURAL']}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Il tipo non può essere modificato dopo la creazione.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Nome" {...form.register('name', { required: true })} />
              <FormField label="Slug" {...form.register('slug')} />
              <div className="space-y-1.5 md:col-span-2">
                <Label>Descrizione</Label>
                <Input {...form.register('description')} />
              </div>
            </div>

            <Separator />

            <p className="text-sm font-medium">Colori</p>
            <div className="grid gap-4 md:grid-cols-3">
              <ColorField label="Primario" {...form.register('primaryColor')} />
              <ColorField label="Secondario" {...form.register('secondaryColor')} />
              <ColorField label="Accento" {...form.register('accentColor')} />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending || !form.formState.isDirty}>
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salva
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <WorkspaceMembersSection workspaceId={activeWorkspaceId} />

      <Separator />

      <WorkspaceAssignedCompaniesSection
        workspaceId={activeWorkspaceId}
        workspaceKind={ws?.kind ?? null}
      />

      <Separator />

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Zona pericolosa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Eliminare il workspace rimuove tutti i dati associati. Questa azione non è reversibile.
          </p>
          <Button variant="destructive" onClick={onDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {confirmDelete ? 'Conferma eliminazione' : 'Elimina workspace'}
          </Button>
          {confirmDelete && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Annulla
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({
  label,
  ...inputProps
}: { readonly label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input {...inputProps} />
    </div>
  );
}

function ColorField({
  label,
  ...inputProps
}: { readonly label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-8 w-8 shrink-0 cursor-pointer rounded border"
          value={(inputProps.value as string) ?? '#000000'}
          onChange={inputProps.onChange}
          name={inputProps.name}
        />
        <Input {...inputProps} className="font-mono text-sm" />
      </div>
    </div>
  );
}

function SectionState({ label }: { readonly label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
