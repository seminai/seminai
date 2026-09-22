import { useMemo, useState } from 'react';
import { Mail, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getGetWorkspacesIdMembersQueryKey,
  useGetWorkspacesIdMembers,
  usePostWorkspacesIdInvite,
} from '@/generated/api/workspaces/workspaces';
import { PostWorkspacesIdInviteBodyRole } from '@/generated/schemas/postWorkspacesIdInviteBodyRole';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Section, SimpleTable } from '@/components/molecules/section-table';
import { extractArray } from '@/lib/api-response';
import { WorkspaceInviteSheet } from '@/components/organisms/workspace-invite-sheet';

interface WorkspaceMemberRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

interface WorkspaceInvitationRow {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: PostWorkspacesIdInviteBodyRole;
  readonly expiresAt: string;
}

interface WorkspaceMembersSectionProps {
  readonly workspaceId: string;
}

export function WorkspaceMembersSection({ workspaceId }: WorkspaceMembersSectionProps) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const membersQuery = useGetWorkspacesIdMembers(workspaceId);
  const inviteMutation = usePostWorkspacesIdInvite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetWorkspacesIdMembersQueryKey(workspaceId),
        });
        toast.success('Invito inviato');
        setInviteOpen(false);
      },
      onError: () => toast.error("Errore durante l'invito"),
    },
  });
  const members = useMemo<WorkspaceMemberRow[]>(() => {
    return extractArray(membersQuery.data?.data, 'members').map((member) => {
      const user = getRecord(member.user);
      return {
        id: String(member.id ?? ''),
        name: String(user?.name ?? '-'),
        email: String(user?.email ?? '-'),
        role: String(member.role ?? '-'),
      };
    });
  }, [membersQuery.data]);
  const invitations = useMemo<WorkspaceInvitationRow[]>(() => {
    return extractArray(membersQuery.data?.data, 'invitations').map((invitation) => {
      const user = getRecord(invitation.user);
      return {
        id: String(invitation.id ?? ''),
        email: String(invitation.email ?? user?.email ?? '-'),
        name: String(user?.name ?? 'Invito in sospeso'),
        role: normalizeInviteRole(String(invitation.role ?? PostWorkspacesIdInviteBodyRole.MEMBER)),
        expiresAt: formatDate(invitation.expiresAt),
      };
    });
  }, [membersQuery.data]);
  const memberRows = members.map((member) => [
    member.name,
    member.email,
    <Badge key={member.id} variant="outline">
      {member.role}
    </Badge>,
  ]);
  const invitationRows = invitations.map((invitation) => [
    invitation.name,
    invitation.email,
    <Badge key={invitation.id} variant="secondary">
      {invitation.role}
    </Badge>,
    invitation.expiresAt,
    <Button
      key={`${invitation.id}-resend`}
      size="sm"
      variant="outline"
      disabled={inviteMutation.isPending}
      onClick={() =>
        inviteMutation.mutate({
          id: workspaceId,
          data: { email: invitation.email, role: invitation.role },
        })
      }
    >
      <Mail className="h-3.5 w-3.5" />
      Reinvia
    </Button>,
  ]);
  if (membersQuery.isLoading) return <SectionState label="Caricamento membri workspace..." />;
  if (membersQuery.isError) return <SectionState label="Errore durante il caricamento membri." />;
  return (
    <div className="space-y-6">
      <Section
        title="Membri workspace"
        count={members.length}
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Invita membro
          </Button>
        }
      >
        {members.length === 0 ? (
          <EmptyState />
        ) : (
          <SimpleTable headers={['Nome', 'Email', 'Ruolo']} rows={memberRows} />
        )}
      </Section>
      <Section title="Inviti in sospeso" count={invitations.length}>
        {invitations.length === 0 ? (
          <EmptyState />
        ) : (
          <SimpleTable headers={['Nome', 'Email', 'Ruolo', 'Scadenza', '']} rows={invitationRows} />
        )}
      </Section>
      <WorkspaceInviteSheet
        open={inviteOpen}
        isPending={inviteMutation.isPending}
        onOpenChange={setInviteOpen}
        onSubmit={(values) => inviteMutation.mutate({ id: workspaceId, data: values })}
      />
    </div>
  );
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeInviteRole(role: string): PostWorkspacesIdInviteBodyRole {
  if (role === PostWorkspacesIdInviteBodyRole.ADMIN) return PostWorkspacesIdInviteBodyRole.ADMIN;
  if (role === PostWorkspacesIdInviteBodyRole.VIEWER) return PostWorkspacesIdInviteBodyRole.VIEWER;
  return PostWorkspacesIdInviteBodyRole.MEMBER;
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('it-IT');
}

function SectionState({ label }: { readonly label: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{label}</p>;
}
