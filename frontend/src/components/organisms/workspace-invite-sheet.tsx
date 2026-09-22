import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PostWorkspacesIdInviteBodyRole } from '@/generated/schemas/postWorkspacesIdInviteBodyRole';

const inviteSchema = z.object({
  email: z.string().email('Email non valida'),
  role: z.enum([
    PostWorkspacesIdInviteBodyRole.ADMIN,
    PostWorkspacesIdInviteBodyRole.MEMBER,
    PostWorkspacesIdInviteBodyRole.VIEWER,
  ]),
});

type InviteValues = z.infer<typeof inviteSchema>;

interface WorkspaceInviteSheetProps {
  readonly open: boolean;
  readonly isPending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: InviteValues) => void;
}

export function WorkspaceInviteSheet({
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: WorkspaceInviteSheetProps) {
  const defaultRole = PostWorkspacesIdInviteBodyRole.MEMBER;
  const [selectedRole, setSelectedRole] = useState<PostWorkspacesIdInviteBodyRole>(defaultRole);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: defaultRole },
  });
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedRole(defaultRole);
      form.reset({ email: '', role: defaultRole });
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invita membro</SheetTitle>
          <SheetDescription>
            Invita un utente nel workspace. Se non ha mai effettuato l'accesso, riceverà una
            password temporanea.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-invite-email">Email</Label>
            <Input id="workspace-invite-email" type="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-invite-role">Ruolo</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => {
                const role = value as PostWorkspacesIdInviteBodyRole;
                setSelectedRole(role);
                form.setValue('role', role);
              }}
            >
              <SelectTrigger id="workspace-invite-role" className="w-full">
                <SelectValue placeholder="Seleziona un ruolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PostWorkspacesIdInviteBodyRole.ADMIN}>Admin</SelectItem>
                <SelectItem value={PostWorkspacesIdInviteBodyRole.MEMBER}>Member</SelectItem>
                <SelectItem value={PostWorkspacesIdInviteBodyRole.VIEWER}>Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Invio...' : 'Invita'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
