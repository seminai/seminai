import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
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
  usePostLabelsBulkExtract,
  getGetLabelsSummaryQueryKey,
} from '@/generated/api/labels/labels';

const createSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Nome richiesto'),
        regNumber: z.string().min(1, 'Numero richiesto'),
      }),
    )
    .min(1, 'Aggiungi almeno una etichetta'),
});

type CreateFormValues = z.infer<typeof createSchema>;

const EMPTY_ROW = { name: '', regNumber: '' } as const;

interface LabelCreateSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Sheet to add new labels by product name + registration number via POST /labels/bulk-extract. */
export function LabelCreateSheet({ open, onOpenChange }: LabelCreateSheetProps) {
  const queryClient = useQueryClient();
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { items: [{ ...EMPTY_ROW }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open) form.reset({ items: [{ ...EMPTY_ROW }] });
  }, [open, form]);

  const extractMutation = usePostLabelsBulkExtract({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetLabelsSummaryQueryKey() });
        toast.success('Estrazione avviata');
        onOpenChange(false);
      },
      onError: () => toast.error("Errore durante l'estrazione delle etichette"),
    },
  });

  const onSubmit = (values: CreateFormValues) => {
    extractMutation.mutate({
      data: { items: values.items.map((item) => ({ name: item.name.trim(), regNumber: item.regNumber.trim() })) },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Aggiungi etichette</SheetTitle>
          <SheetDescription>
            Inserisci nome commerciale e numero di registrazione. Il backend estrae l'etichetta
            dalla fonte ministeriale.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`name-${index}`}>Nome prodotto</Label>
                <Input id={`name-${index}`} {...form.register(`items.${index}.name`)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`reg-${index}`}>N. registrazione</Label>
                <Input id={`reg-${index}`} {...form.register(`items.${index}.regNumber`)} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                aria-label="Rimuovi riga"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {form.formState.errors.items?.root && (
            <p className="text-xs text-destructive">{form.formState.errors.items.root.message}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => append({ ...EMPTY_ROW })}
          >
            <Plus className="mr-1 h-4 w-4" />
            Aggiungi riga
          </Button>

          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={extractMutation.isPending}>
              {extractMutation.isPending ? 'Estrazione...' : 'Estrai'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
