import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePostUserOnCompany,
  getGetUserOnCompanyCompanyCompanyIdQueryKey,
} from '@/generated/api/user-on-company/user-on-company';
import { PostUserOnCompanyBodyRole } from '@/generated/schemas/postUserOnCompanyBodyRole';

const inviteSchema = z.object({
  name: z.string().min(1, 'Nome richiesto'),
  email: z.string().email('Email non valida'),
  role: z.enum([
    PostUserOnCompanyBodyRole.ADMIN,
    PostUserOnCompanyBodyRole.EDITOR,
    PostUserOnCompanyBodyRole.VIEWER,
  ]),
});

type InviteValues = z.infer<typeof inviteSchema>;

interface UserInviteSheetProps {
  readonly companyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function UserInviteSheet({ companyId, open, onOpenChange }: UserInviteSheetProps) {
  const queryClient = useQueryClient();

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', email: '', role: PostUserOnCompanyBodyRole.VIEWER },
  });
  const selectedRole = useWatch({ control: form.control, name: 'role' });

  useEffect(() => {
    if (!open) form.reset({ name: '', email: '', role: PostUserOnCompanyBodyRole.VIEWER });
  }, [open, form]);

  const mutation = usePostUserOnCompany({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetUserOnCompanyCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Utente invitato');
        onOpenChange(false);
      },
      onError: () => toast.error("Errore durante l'invito dell'utente"),
    },
  });

  const onSubmit = (values: InviteValues) => {
    mutation.mutate({ data: { ...values, companyId } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invita utente</SheetTitle>
          <SheetDescription>
            Aggiungi un utente all&apos;azienda. Se l&apos;email non esiste, sarà creato un nuovo
            account.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Nome</Label>
            <Input id="invite-name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Ruolo</Label>
            <Select
              value={selectedRole}
              onValueChange={(v) => form.setValue('role', v as PostUserOnCompanyBodyRole)}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Seleziona un ruolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PostUserOnCompanyBodyRole.ADMIN}>Admin</SelectItem>
                <SelectItem value={PostUserOnCompanyBodyRole.EDITOR}>Editor</SelectItem>
                <SelectItem value={PostUserOnCompanyBodyRole.VIEWER}>Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Invio...' : 'Invita'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
