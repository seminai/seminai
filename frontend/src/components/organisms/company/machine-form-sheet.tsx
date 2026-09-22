import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
  usePostMachinesBulk,
  usePutMachinesId,
  getGetMachinesCompanyCompanyIdQueryKey,
} from '@/generated/api/machines/machines';

const machineSchema = z.object({
  name: z.string().min(1, 'Nome richiesto'),
  identifier: z.string().min(1, 'Identificativo richiesto'),
  lastPositiveRevisionDate: z.string().optional(),
  functionalControlDate: z.string().optional(),
  calibrationDate: z.string().optional(),
  revisionReminderDays: z.coerce.number().int().min(0).optional(),
  calibrationReminderDays: z.coerce.number().int().min(0).optional(),
  functionalControlReminderDays: z.coerce.number().int().min(0).optional(),
});

type MachineFormInput = z.input<typeof machineSchema>;
type MachineFormValues = z.output<typeof machineSchema>;

export interface MachineInitialData {
  readonly id: string;
  readonly name?: string;
  readonly identifier?: string;
  readonly lastPositiveRevisionDate?: string;
  readonly functionalControlDate?: string;
  readonly calibrationDate?: string;
  readonly revisionReminderDays?: number;
  readonly calibrationReminderDays?: number;
  readonly functionalControlReminderDays?: number;
}

interface MachineFormSheetProps {
  readonly companyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialData?: MachineInitialData | null;
}

const EMPTY_DEFAULTS: MachineFormInput = {
  name: '',
  identifier: '',
  lastPositiveRevisionDate: '',
  functionalControlDate: '',
  calibrationDate: '',
  revisionReminderDays: undefined,
  calibrationReminderDays: undefined,
  functionalControlReminderDays: undefined,
};

const toDateInput = (value?: string): string => {
  if (!value) return '';
  return value.length >= 10 ? value.slice(0, 10) : value;
};

export function MachineFormSheet({ companyId, open, onOpenChange, initialData }: MachineFormSheetProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initialData?.id;

  const form = useForm<MachineFormInput, unknown, MachineFormValues>({
    resolver: zodResolver(machineSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      form.reset({
        name: initialData.name ?? '',
        identifier: initialData.identifier ?? '',
        lastPositiveRevisionDate: toDateInput(initialData.lastPositiveRevisionDate),
        functionalControlDate: toDateInput(initialData.functionalControlDate),
        calibrationDate: toDateInput(initialData.calibrationDate),
        revisionReminderDays: initialData.revisionReminderDays,
        calibrationReminderDays: initialData.calibrationReminderDays,
        functionalControlReminderDays: initialData.functionalControlReminderDays,
      });
    } else {
      form.reset(EMPTY_DEFAULTS);
    }
  }, [open, initialData, form]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetMachinesCompanyCompanyIdQueryKey(companyId),
    });

  const createMutation = usePostMachinesBulk({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Macchina creata');
        onOpenChange(false);
      },
      onError: () => toast.error('Errore durante la creazione della macchina'),
    },
  });

  const updateMutation = usePutMachinesId({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Macchina aggiornata');
        onOpenChange(false);
      },
      onError: () => toast.error("Errore durante l'aggiornamento della macchina"),
    },
  });

  const onSubmit = (values: MachineFormValues) => {
    const cleaned = {
      name: values.name,
      identifier: values.identifier,
      lastPositiveRevisionDate: values.lastPositiveRevisionDate || undefined,
      functionalControlDate: values.functionalControlDate || undefined,
      calibrationDate: values.calibrationDate || undefined,
      revisionReminderDays: values.revisionReminderDays,
      calibrationReminderDays: values.calibrationReminderDays,
      functionalControlReminderDays: values.functionalControlReminderDays,
    };

    if (isEdit && initialData) {
      updateMutation.mutate({ id: initialData.id, data: { ...cleaned, companyId } });
    } else {
      createMutation.mutate({ data: { machines: [{ ...cleaned, companyId }] } });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Modifica macchina' : 'Aggiungi macchina'}</SheetTitle>
          <SheetDescription>
            Dati anagrafici e scadenze di revisione, calibrazione e controllo funzionale.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <FormField label="Nome" id="m-name" error={form.formState.errors.name?.message}>
            <Input id="m-name" {...form.register('name')} />
          </FormField>

          <FormField label="Identificativo" id="m-id" error={form.formState.errors.identifier?.message}>
            <Input id="m-id" {...form.register('identifier')} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ultima revisione" id="m-rev">
              <Input id="m-rev" type="date" {...form.register('lastPositiveRevisionDate')} />
            </FormField>
            <FormField label="Promemoria revisione (gg)" id="m-rev-rem">
              <Input id="m-rev-rem" type="number" min={0} {...form.register('revisionReminderDays')} />
            </FormField>

            <FormField label="Ultima calibrazione" id="m-cal">
              <Input id="m-cal" type="date" {...form.register('calibrationDate')} />
            </FormField>
            <FormField label="Promemoria calibrazione (gg)" id="m-cal-rem">
              <Input id="m-cal-rem" type="number" min={0} {...form.register('calibrationReminderDays')} />
            </FormField>

            <FormField label="Controllo funzionale" id="m-fc">
              <Input id="m-fc" type="date" {...form.register('functionalControlDate')} />
            </FormField>
            <FormField label="Promemoria controllo (gg)" id="m-fc-rem">
              <Input id="m-fc-rem" type="number" min={0} {...form.register('functionalControlReminderDays')} />
            </FormField>
          </div>

          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvataggio...' : isEdit ? 'Salva' : 'Crea'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: React.ReactNode;
}

function FormField({ id, label, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
