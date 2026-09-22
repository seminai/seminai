import { useMemo, useState } from 'react';
import { Mail, MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Section, SimpleTable, EmptyState } from '@/components/molecules/section-table';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import {
  useGetUserOnCompanyCompanyCompanyId,
  useDeleteUserOnCompanyCompanyCompanyIdUserUserId,
  usePostUserOnCompanyCompanyCompanyIdUserUserIdResendInvitation,
  getGetUserOnCompanyCompanyCompanyIdQueryKey,
} from '@/generated/api/user-on-company/user-on-company';
import { extractArray } from '@/lib/api-response';
import { useCompanyRole } from '@/hooks/use-company-role';
import { UserInviteSheet } from '@/components/organisms/company/user-invite-sheet';
import { UserRoleEditSheet } from '@/components/organisms/company/user-role-edit-sheet';

const ROLE_STYLES: Record<string, string> = {
  ADMIN: 'bg-red-50 text-red-700 border-red-200',
  GOD: 'bg-purple-50 text-purple-700 border-purple-200',
  EDITOR: 'bg-blue-50 text-blue-700 border-blue-200',
  VIEWER: 'bg-gray-100 text-gray-700 border-gray-200',
};

interface UserRow {
  readonly membershipId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly invitationPending: boolean;
}

interface CompanyUsersSectionProps {
  readonly companyId: string;
}

export function CompanyUsersSection({ companyId }: CompanyUsersSectionProps) {
  const queryClient = useQueryClient();
  const { canManage } = useCompanyRole(companyId);
  const { data: usersRes } = useGetUserOnCompanyCompanyCompanyId(companyId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  const users = useMemo<UserRow[]>(() => {
    if (!usersRes?.data) return [];
    return extractArray(usersRes.data, 'usersOnCompany', 'users').map((u) => {
      const user = (u.user ?? u) as Record<string, unknown>;
      return {
        membershipId: String(u.id ?? ''),
        userId: String(user.id ?? ''),
        name: String(user.name ?? user.firstName ?? '-'),
        email: String(user.email ?? '-'),
        role: String(u.role ?? user.role ?? '-'),
        invitationPending: Boolean(user.invitationPending),
      };
    });
  }, [usersRes]);

  const deleteMutation = useDeleteUserOnCompanyCompanyCompanyIdUserUserId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetUserOnCompanyCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Utente rimosso');
        setDeleting(null);
      },
      onError: () => toast.error("Errore durante la rimozione dell'utente"),
    },
  });

  const resendMutation = usePostUserOnCompanyCompanyCompanyIdUserUserIdResendInvitation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetUserOnCompanyCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Invito reinviato');
      },
      onError: () => toast.error("Errore durante il reinvio dell'invito"),
    },
  });

  const headers = canManage ? ['Nome', 'Email', 'Ruolo', ''] : ['Nome', 'Email', 'Ruolo'];

  const rows = users.map((u) => {
    const cells: React.ReactNode[] = [
      u.name,
      u.email,
      <div key={u.membershipId} className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={ROLE_STYLES[u.role] ?? ''}>
          {u.role}
        </Badge>
        {u.invitationPending && <Badge variant="secondary">Invito in sospeso</Badge>}
      </div>,
    ];
    if (canManage) {
      cells.push(
        <DropdownMenu key="actions">
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Azioni"
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {u.invitationPending && (
              <DropdownMenuItem
                disabled={resendMutation.isPending}
                onClick={() => resendMutation.mutate({ companyId, userId: u.userId })}
              >
                <Mail className="mr-2 h-4 w-4" />
                Reinvia invito
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setEditing(u)}>
              <Pencil className="mr-2 h-4 w-4" />
              Cambia ruolo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleting(u)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Rimuovi
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    }
    return cells;
  });

  return (
    <>
      <Section
        title="Utenti"
        count={users.length}
        action={
          canManage ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Invita utente
            </Button>
          ) : undefined
        }
      >
        {users.length === 0 ? <EmptyState /> : <SimpleTable headers={headers} rows={rows} />}
      </Section>

      {canManage && (
        <>
          <UserInviteSheet companyId={companyId} open={inviteOpen} onOpenChange={setInviteOpen} />
          <UserRoleEditSheet
            companyId={companyId}
            membershipId={editing?.membershipId ?? null}
            currentRole={editing?.role ?? null}
            userName={editing?.name ?? null}
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
          />
          <ConfirmDeleteDialog
            open={!!deleting}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Rimuovi utente"
            description={
              deleting
                ? `Vuoi rimuovere ${deleting.name} dall'azienda? L'utente non potrà più accedervi.`
                : ''
            }
            confirmLabel="Rimuovi"
            isPending={deleteMutation.isPending}
            onConfirm={() => {
              if (deleting) {
                deleteMutation.mutate({ companyId, userId: deleting.userId });
              }
            }}
          />
        </>
      )}
    </>
  );
}
