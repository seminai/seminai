import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompanyOptions } from '@/hooks/use-company-options';
import { useCreateBusinessPartner } from '@/hooks/use-sales';
import type { CreateBusinessPartnerPayload } from '@/types/sales';
import { PARTNER_TYPE_LABELS } from '@/types/sales';

const partnerSchema = z.object({
  companyId: z.string().min(1, 'Seleziona un\'azienda'),
  type: z.enum(['CUSTOMER', 'SUPPLIER']),
  name: z.string().min(1, 'La ragione sociale è obbligatoria'),
  vatNumber: z.string().optional(),
  fiscalCode: z.string().optional(),
  sdiCode: z.string().optional(),
  pec: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  referent: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  cap: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryNotesText: z.string().optional(),
  deliveryHours: z.string().optional(),
});

type PartnerFormValues = z.infer<typeof partnerSchema>;

function FormField(props: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{props.label}</Label>
      {props.children}
      {props.error ? <span className="text-xs text-destructive">{props.error}</span> : null}
    </div>
  );
}

/** Manual creation form for a customer or supplier (anagrafica). */
export function BusinessPartnerForm() {
  const navigate = useNavigate();
  const { companies, isLoading: isLoadingCompanies } = useCompanyOptions();
  const mutation = useCreateBusinessPartner();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: { type: 'CUSTOMER', companyId: '' },
  });

  const onSubmit = (values: PartnerFormValues) => {
    const payload: CreateBusinessPartnerPayload = values;
    mutation.mutate(payload, {
      onSuccess: (data) => {
        toast.success(
          data.reused ? `"${data.partner.name}" già presente: riutilizzato` : 'Anagrafica creata',
        );
        void navigate({ to: '/archivio', search: { companyId: values.companyId } });
      },
      onError: () => toast.error('Errore durante la creazione dell\'anagrafica'),
    });
  };

  const isPending = mutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <FormField label="Tipo">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value) =>
                      value === 'SUPPLIER'
                        ? PARTNER_TYPE_LABELS.SUPPLIER
                        : PARTNER_TYPE_LABELS.CUSTOMER
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOMER">{PARTNER_TYPE_LABELS.CUSTOMER}</SelectItem>
                  <SelectItem value="SUPPLIER">{PARTNER_TYPE_LABELS.SUPPLIER}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label="Azienda" error={errors.companyId?.message}>
          <Controller
            control={control}
            name="companyId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isLoadingCompanies}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona azienda">
                    {(value) =>
                      companies.find((company) => company.value === value)?.label ??
                      'Seleziona azienda'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.value} value={company.value}>
                      {company.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <div className="sm:col-span-2">
          <FormField label="Ragione sociale / nome" error={errors.name?.message}>
            <Input {...register('name')} placeholder="Es. Cantina Rossi S.r.l." />
          </FormField>
        </div>

        <FormField label="Partita IVA">
          <Input {...register('vatNumber')} />
        </FormField>
        <FormField label="Codice fiscale">
          <Input {...register('fiscalCode')} />
        </FormField>
        <FormField label="Codice SDI">
          <Input {...register('sdiCode')} />
        </FormField>
        <FormField label="PEC">
          <Input {...register('pec')} />
        </FormField>
        <FormField label="Email">
          <Input {...register('email')} type="email" />
        </FormField>
        <FormField label="Telefono">
          <Input {...register('phone')} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Persona di riferimento">
            <Input {...register('referent')} />
          </FormField>
        </div>

        <FormField label="Indirizzo (sede legale)">
          <Input {...register('address')} />
        </FormField>
        <FormField label="Città">
          <Input {...register('city')} />
        </FormField>
        <FormField label="CAP">
          <Input {...register('cap')} />
        </FormField>
        <FormField label="Indirizzo di consegna">
          <Input {...register('deliveryAddress')} />
        </FormField>

        <div className="sm:col-span-2">
          <FormField label="Note consegna">
            <Textarea {...register('deliveryNotesText')} rows={2} />
          </FormField>
        </div>
        <FormField label="Orari di consegna">
          <Input {...register('deliveryHours')} placeholder="Es. Lun-Ven 8:00-12:00" />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigate({ to: '/add-data', search: { type: 'manual' } })}
          disabled={isPending}
        >
          Annulla
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creazione...' : 'Crea anagrafica'}
        </Button>
      </div>
    </form>
  );
}
