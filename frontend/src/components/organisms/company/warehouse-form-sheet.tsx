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
  usePostWarehouses,
  usePutWarehousesId,
  getGetWarehousesCompanyCompanyIdQueryKey,
} from '@/generated/api/warehouses/warehouses';

const warehouseSchema = z.object({
  name: z.string().min(1, 'Nome richiesto'),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  nation: z.string().optional(),
  cap: z.string().optional(),
  sezione: z.string().optional(),
  foglio: z.string().optional(),
  particella: z.string().optional(),
  subalterno: z.string().optional(),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

export interface WarehouseInitialData {
  readonly id: string;
  readonly name?: string;
  readonly address?: string;
  readonly city?: string;
  readonly region?: string;
  readonly nation?: string;
  readonly cap?: string;
  readonly sezione?: string;
  readonly foglio?: string;
  readonly particella?: string;
  readonly subalterno?: string;
}

interface WarehouseFormSheetProps {
  readonly companyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialData?: WarehouseInitialData | null;
}

const EMPTY_DEFAULTS: WarehouseFormValues = {
  name: '',
  address: '',
  city: '',
  region: '',
  nation: '',
  cap: '',
  sezione: '',
  foglio: '',
  particella: '',
  subalterno: '',
};

export function WarehouseFormSheet({ companyId, open, onOpenChange, initialData }: WarehouseFormSheetProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initialData?.id;

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      form.reset({
        name: initialData.name ?? '',
        address: initialData.address ?? '',
        city: initialData.city ?? '',
        region: initialData.region ?? '',
        nation: initialData.nation ?? '',
        cap: initialData.cap ?? '',
        sezione: initialData.sezione ?? '',
        foglio: initialData.foglio ?? '',
        particella: initialData.particella ?? '',
        subalterno: initialData.subalterno ?? '',
      });
    } else {
      form.reset(EMPTY_DEFAULTS);
    }
  }, [open, initialData, form]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetWarehousesCompanyCompanyIdQueryKey(companyId),
    });

  const createMutation = usePostWarehouses({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Magazzino creato');
        onOpenChange(false);
      },
      onError: () => toast.error('Errore durante la creazione del magazzino'),
    },
  });

  const updateMutation = usePutWarehousesId({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Magazzino aggiornato');
        onOpenChange(false);
      },
      onError: () => toast.error("Errore durante l'aggiornamento del magazzino"),
    },
  });

  const onSubmit = (values: WarehouseFormValues) => {
    if (isEdit && initialData) {
      updateMutation.mutate({ id: initialData.id, data: values });
    } else {
      createMutation.mutate({ data: { ...values, companyId } });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Modifica magazzino' : 'Aggiungi magazzino'}</SheetTitle>
          <SheetDescription>Dati anagrafici e riferimenti catastali.</SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <Field id="w-name" label="Nome" error={form.formState.errors.name?.message}>
            <Input id="w-name" {...form.register('name')} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="w-address" label="Indirizzo">
              <Input id="w-address" {...form.register('address')} />
            </Field>
            <Field id="w-city" label="Città">
              <Input id="w-city" {...form.register('city')} />
            </Field>
            <Field id="w-region" label="Regione">
              <Input id="w-region" {...form.register('region')} />
            </Field>
            <Field id="w-cap" label="CAP">
              <Input id="w-cap" {...form.register('cap')} />
            </Field>
            <Field id="w-nation" label="Nazione">
              <Input id="w-nation" {...form.register('nation')} />
            </Field>
          </div>

          <p className="mt-1 text-xs font-medium text-muted-foreground">Catasto</p>
          <div className="grid grid-cols-2 gap-3">
            <Field id="w-sez" label="Sezione">
              <Input id="w-sez" {...form.register('sezione')} />
            </Field>
            <Field id="w-fog" label="Foglio">
              <Input id="w-fog" {...form.register('foglio')} />
            </Field>
            <Field id="w-par" label="Particella">
              <Input id="w-par" {...form.register('particella')} />
            </Field>
            <Field id="w-sub" label="Subalterno">
              <Input id="w-sub" {...form.register('subalterno')} />
            </Field>
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

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
