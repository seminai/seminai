import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePatchUserOnCompanyIdRole,
  getGetUserOnCompanyCompanyCompanyIdQueryKey,
} from '@/generated/api/user-on-company/user-on-company';
import { PatchUserOnCompanyIdRoleBodyRole } from '@/generated/schemas/patchUserOnCompanyIdRoleBodyRole';

interface UserRoleEditSheetProps {
  readonly companyId: string;
  readonly membershipId: string | null;
  readonly currentRole: string | null;
  readonly userName: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const VALID_ROLES = [
  PatchUserOnCompanyIdRoleBodyRole.ADMIN,
  PatchUserOnCompanyIdRoleBodyRole.EDITOR,
  PatchUserOnCompanyIdRoleBodyRole.VIEWER,
];

const ROLE_LABELS: Record<PatchUserOnCompanyIdRoleBodyRole, string> = {
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

const normalizeRole = (raw: string | null): PatchUserOnCompanyIdRoleBodyRole => {
  return VALID_ROLES.find((r) => r === raw) ?? PatchUserOnCompanyIdRoleBodyRole.VIEWER;
};

interface FormValues {
  readonly role: PatchUserOnCompanyIdRoleBodyRole;
}

export function UserRoleEditSheet({
  companyId,
  membershipId,
  currentRole,
  userName,
  open,
  onOpenChange,
}: UserRoleEditSheetProps) {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    defaultValues: { role: normalizeRole(currentRole) },
  });
  const selectedRole = useWatch({ control: form.control, name: 'role' });

  useEffect(() => {
    if (open) {
      form.reset({ role: normalizeRole(currentRole) });
    }
  }, [open, currentRole, form]);

  const mutation = usePatchUserOnCompanyIdRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetUserOnCompanyCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Ruolo aggiornato');
        onOpenChange(false);
      },
      onError: () => toast.error("Errore durante l'aggiornamento del ruolo"),
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!membershipId) return;
    mutation.mutate({ id: membershipId, data: { role: values.role, companyId } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cambia ruolo</SheetTitle>
          <SheetDescription>
            {userName
              ? `Aggiorna il ruolo di ${userName} nell'azienda.`
              : "Aggiorna il ruolo dell'utente."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-role">Ruolo</Label>
            <Select
              value={selectedRole}
              onValueChange={(v) => form.setValue('role', v as PatchUserOnCompanyIdRoleBodyRole)}
            >
              <SelectTrigger id="edit-role" className="w-full">
                <SelectValue>
                  {(v) => ROLE_LABELS[normalizeRole(typeof v === 'string' ? v : null)]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {VALID_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={mutation.isPending || !membershipId}>
              {mutation.isPending ? 'Salvataggio...' : 'Salva'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
