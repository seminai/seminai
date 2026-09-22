import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { FieldRowCard } from '@/components/organisms/manual-add/field-row-card';
import {
  EMPTY_FIELD_ROW,
  fieldsBulkSchema,
  toBulkFieldPayload,
  type FieldsBulkValues,
} from '@/components/organisms/manual-add/fields-bulk-schema';
import {
  usePostFieldsBulk,
  getGetFieldsQueryKey,
} from '@/generated/api/fields/fields';
import { useCompanyOptions } from '@/hooks/use-company-options';
import { capture } from '@/lib/analytics';

export function FieldsBulkForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companies, isLoading: isLoadingCompanies } = useCompanyOptions();
  const [companyId, setCompanyId] = useState<string>('');

  const form = useForm<FieldsBulkValues>({
    resolver: zodResolver(fieldsBulkSchema),
    defaultValues: { fields: [{ ...EMPTY_FIELD_ROW }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'fields',
  });

  const mutation = usePostFieldsBulk({
    mutation: {
      onSuccess: (_response, variables) => {
        void queryClient.invalidateQueries({ queryKey: getGetFieldsQueryKey() });
        const count = variables.data.fields.length;
        capture('field_wizard_completed', { field_count: count });
        toast.success(`${count} ${count === 1 ? 'campo creato' : 'campi creati'}`);
        void navigate({ to: '/add-data', search: { type: 'manual' } });
      },
      onError: () => toast.error('Errore durante la creazione dei campi'),
    },
  });

  const onSubmit = (values: FieldsBulkValues) => {
    if (!companyId) {
      toast.error("Seleziona l'azienda di appartenenza");
      return;
    }
    mutation.mutate({
      data: {
        fields: values.fields.map((row) => toBulkFieldPayload(row, companyId)),
      },
    });
  };

  const isPending = mutation.isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Azienda</h2>
        {isLoadingCompanies ? (
          <p className="text-sm text-muted-foreground">Caricamento aziende...</p>
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna azienda disponibile. Crea prima un'azienda.
          </p>
        ) : (
          <SearchableSelect
            value={companyId}
            options={companies}
            placeholder="Seleziona azienda"
            searchPlaceholder="Cerca azienda..."
            emptyMessage="Nessuna azienda trovata."
            disabled={isPending}
            onChange={(value) => setCompanyId(value ?? '')}
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <FieldRowCard
            key={field.id}
            form={form}
            index={index}
            disabled={isPending}
            canRemove={fields.length > 1}
            onRemove={() => remove(index)}
          />
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ ...EMPTY_FIELD_ROW })}
          disabled={isPending}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Aggiungi campo
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate({ to: '/add-data', search: { type: 'manual' } })}
            disabled={isPending}
          >
            Annulla
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creazione...' : `Crea ${fields.length} ${fields.length === 1 ? 'campo' : 'campi'}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
