import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Loader2, Lock, LockOpen, UserX } from 'lucide-react';
import {
  deactivateAdminUser,
  getAdminAccessStatus,
  getAdminDashboardSummary,
  reactivateAdminUser,
  setAdminUserBlockedStatus,
  unlockAdminAccess,
  type AdminUserSummary,
} from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ADMIN_ACCESS_STATUS_QUERY_KEY = ['admin', 'access-status'] as const;
const ADMIN_DASHBOARD_QUERY_KEY = ['admin', 'dashboard-summary'] as const;

export function SettingsUsersManagementSection() {
  const queryClient = useQueryClient();
  const [unlockPassword, setUnlockPassword] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const accessStatusQuery = useQuery({
    queryKey: ADMIN_ACCESS_STATUS_QUERY_KEY,
    queryFn: getAdminAccessStatus,
    retry: false,
  });
  const dashboardQuery = useQuery({
    queryKey: ADMIN_DASHBOARD_QUERY_KEY,
    queryFn: getAdminDashboardSummary,
    enabled: accessStatusQuery.data?.isUnlocked === true,
    retry: false,
  });
  const unlockMutation = useMutation({
    mutationFn: unlockAdminAccess,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_ACCESS_STATUS_QUERY_KEY });
      setUnlockPassword('');
    },
  });
  const setBlockedMutation = useMutation({
    mutationFn: setAdminUserBlockedStatus,
    onMutate: ({ userId }) => setSelectedUserId(userId),
    onSettled: () => {
      setSelectedUserId(null);
      void queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_QUERY_KEY });
    },
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateAdminUser,
    onMutate: (userId: string) => setSelectedUserId(userId),
    onSettled: () => {
      setSelectedUserId(null);
      void queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_QUERY_KEY });
    },
  });
  const reactivateMutation = useMutation({
    mutationFn: reactivateAdminUser,
    onMutate: (userId: string) => setSelectedUserId(userId),
    onSettled: () => {
      setSelectedUserId(null);
      void queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_QUERY_KEY });
    },
  });
  const users = useMemo(() => dashboardQuery.data?.users ?? [], [dashboardQuery.data?.users]);
  const isUnlocking = unlockMutation.isPending;
  const isUnlocked = accessStatusQuery.data?.isUnlocked ?? false;

  const handleUnlockSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unlockPassword.trim()) {
      return;
    }
    unlockMutation.mutate({ password: unlockPassword.trim() });
  };

  return (
    <div className="space-y-6 p-5">
      <h2 className="text-lg font-semibold">Users management</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isUnlocked ? <LockOpen className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4" />}
            Admin secure area
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {isUnlocked
              ? `Unlocked for ${accessStatusQuery.data?.durationMinutes ?? 30} minutes.`
              : 'This section requires admin unlock password.'}
          </p>
          {!isUnlocked && (
            <form className="flex max-w-md items-center gap-2" onSubmit={handleUnlockSubmit}>
              <Input
                type="password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                placeholder="Enter admin unlock password"
              />
              <Button type="submit" disabled={isUnlocking || unlockPassword.trim().length === 0}>
                {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unlock'}
              </Button>
            </form>
          )}
          {unlockMutation.isError && (
            <p className="text-sm text-destructive">
              Unlock failed. Check password or whitelist permissions.
            </p>
          )}
          {accessStatusQuery.isError && (
            <p className="text-sm text-destructive">
              You do not have access to this area.
            </p>
          )}
        </CardContent>
      </Card>

      {isUnlocked && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Totals</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <StatBadge label="Users" value={dashboardQuery.data?.totals.totalUsers ?? 0} />
              <StatBadge label="Blocked" value={dashboardQuery.data?.totals.blockedUsers ?? 0} />
              <StatBadge label="Deactivated" value={dashboardQuery.data?.totals.deactivatedUsers ?? 0} />
              <StatBadge label="Inactive" value={dashboardQuery.data?.totals.inactiveUsers ?? 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Loading users...</p>
              )}
              {dashboardQuery.isError && (
                <p className="text-sm text-destructive">Unable to load users list.</p>
              )}
              {!dashboardQuery.isLoading && !dashboardQuery.isError && (
                <UsersTable
                  users={users}
                  selectedUserId={selectedUserId}
                  onToggleBlocked={(user) =>
                    setBlockedMutation.mutate({ userId: user.userId, isBlocked: !user.isBlocked })
                  }
                  onDeactivate={(userId) => deactivateMutation.mutate(userId)}
                  onReactivate={(userId) => reactivateMutation.mutate(userId)}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function UsersTable({
  users,
  selectedUserId,
  onToggleBlocked,
  onDeactivate,
  onReactivate,
}: {
  readonly users: ReadonlyArray<AdminUserSummary>;
  readonly selectedUserId: string | null;
  readonly onToggleBlocked: (user: AdminUserSummary) => void;
  readonly onDeactivate: (userId: string) => void;
  readonly onReactivate: (userId: string) => void;
}) {
  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">No users available.</p>;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isPending = selectedUserId === user.userId;
            return (
              <TableRow key={user.userId}>
                <TableCell>{`${user.name} ${user.surname ?? ''}`.trim()}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.isBlocked ? 'destructive' : 'outline'}>
                      {user.isBlocked ? 'Blocked' : 'Active'}
                    </Badge>
                    <Badge variant={user.isDeactivated ? 'destructive' : 'outline'}>
                      {user.isDeactivated ? 'Deactivated' : 'Enabled'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => onToggleBlocked(user)} disabled={isPending}>
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      {user.isBlocked ? 'Unblock' : 'Block'}
                    </Button>
                    {!user.isDeactivated ? (
                      <Button size="sm" variant="destructive" onClick={() => onDeactivate(user.userId)} disabled={isPending}>
                        <UserX className="h-4 w-4" />
                        Deactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onReactivate(user.userId)} disabled={isPending}>
                        <CheckCircle2 className="h-4 w-4" />
                        Reactivate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function StatBadge({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
