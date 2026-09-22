import { useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import type { PutLabelsIdBody } from '@/generated/schemas';
import type { LabelDetailView } from '@/types/label';

const editSchema = z.object({
  productName: z.string().min(1, 'Nome richiesto'),
  registrationNumber: z.string().min(1, 'Numero richiesto'),
  principioAttivo: z.string().optional(),
  composizione: z.string().optional(),
  noteTecniche: z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface LabelFormSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly detail: LabelDetailView;
  readonly onSave: (data: PutLabelsIdBody) => Promise<unknown>;
  readonly isSaving: boolean;
}

/** Edit sheet for a label's scalar fields, merging changes onto the existing label payload. */
export function LabelFormSheet({ open, onOpenChange, detail, onSave, isSaving }: LabelFormSheetProps) {
  const form = useForm<EditFormValues>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({
      productName: detail.productName,
      registrationNumber: detail.registrationNumber,
      principioAttivo: detail.label.principio_attivo ?? '',
      composizione: detail.label.composizione ?? '',
      noteTecniche: detail.label.note_tecniche ?? '',
    });
  }, [open, detail, form]);

  const onSubmit = async (values: EditFormValues) => {
    const payload: PutLabelsIdBody = {
      productName: values.productName.trim(),
      registrationNumber: values.registrationNumber.trim(),
      label: {
        ...detail.label,
        principio_attivo: values.principioAttivo?.trim() || null,
        composizione: values.composizione?.trim() || null,
        note_tecniche: values.noteTecniche?.trim() || null,
      },
    };
    await onSave(payload);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Modifica etichetta</SheetTitle>
          <SheetDescription>Aggiorna i dati principali dell'etichetta.</SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <div className="space-y-1.5">
            <Label htmlFor="l-name">Nome commerciale</Label>
            <Input id="l-name" {...form.register('productName')} />
            {form.formState.errors.productName && (
              <p className="text-xs text-destructive">{form.formState.errors.productName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-reg">N. registrazione</Label>
            <Input id="l-reg" {...form.register('registrationNumber')} />
            {form.formState.errors.registrationNumber && (
              <p className="text-xs text-destructive">{form.formState.errors.registrationNumber.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-pa">Principio attivo</Label>
            <Input id="l-pa" {...form.register('principioAttivo')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-comp">Composizione</Label>
            <Textarea id="l-comp" rows={2} {...form.register('composizione')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-note">Note tecniche</Label>
            <Textarea id="l-note" rows={3} {...form.register('noteTecniche')} />
          </div>

          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
