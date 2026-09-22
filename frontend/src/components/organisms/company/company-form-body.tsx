import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import { VisuraCameraleUploader } from '@/components/organisms/company/visura-camerale-uploader';
import type { CompanyFormValues } from '@/components/organisms/company/company-schema';
import { COMPANY_KIND_LABELS } from '@/types/company-kind';
import type { WorkspaceKind } from '@/types/workspace';
import { WORKSPACE_KIND_LABELS } from '@/types/workspace';

interface CompanyFormBodyProps {
  readonly form: UseFormReturn<CompanyFormValues>;
  readonly disabled?: boolean;
  readonly lockedKind?: WorkspaceKind;
  readonly isExtractingVisura: boolean;
  readonly onVisuraFile: (file: File) => void;
  readonly idPrefix?: string;
}

export function CompanyFormBody({
  form,
  disabled,
  lockedKind,
  isExtractingVisura,
  onVisuraFile,
  idPrefix = 'c',
}: CompanyFormBodyProps) {
  const errors = form.formState.errors;
  const kindLocked = lockedKind !== undefined;
  return (
    <div className="flex flex-col gap-3">
      <FormFieldRow id={`${idPrefix}-kind`} label="Tipo azienda *" error={errors.kind?.message}>
        {kindLocked ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Tipo allineato al workspace corrente (
            {WORKSPACE_KIND_LABELS[lockedKind]})
          </p>
        ) : null}
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled || kindLocked}
            >
              <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
                <SelectValue placeholder="Seleziona tipo">
                  {(value: unknown) =>
                    value === 'AGRICULTURAL' || value === 'MANUFACTURING'
                      ? COMPANY_KIND_LABELS[value]
                      : 'Seleziona tipo'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AGRICULTURAL">{COMPANY_KIND_LABELS.AGRICULTURAL}</SelectItem>
                <SelectItem value="MANUFACTURING">{COMPANY_KIND_LABELS.MANUFACTURING}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </FormFieldRow>

      <VisuraCameraleUploader
        disabled={disabled}
        isExtracting={isExtractingVisura}
        onFile={onVisuraFile}
      />

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          oppure inserisci manualmente
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <FormFieldRow id={`${idPrefix}-name`} label="Nome *" error={errors.name?.message}>
        <Input id={`${idPrefix}-name`} {...form.register('name')} disabled={disabled} />
      </FormFieldRow>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormFieldRow
          id={`${idPrefix}-vat`}
          label="Partita IVA *"
          error={errors.vatNumber?.message}
        >
          <Input
            id={`${idPrefix}-vat`}
            inputMode="numeric"
            {...form.register('vatNumber')}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow
          id={`${idPrefix}-fc`}
          label="Codice fiscale"
          error={errors.fiscalCode?.message}
        >
          <Input
            id={`${idPrefix}-fc`}
            {...form.register('fiscalCode')}
            disabled={disabled}
          />
        </FormFieldRow>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormFieldRow id={`${idPrefix}-address`} label="Indirizzo">
          <Input
            id={`${idPrefix}-address`}
            {...form.register('address')}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow id={`${idPrefix}-city`} label="Città">
          <Input id={`${idPrefix}-city`} {...form.register('city')} disabled={disabled} />
        </FormFieldRow>
        <FormFieldRow id={`${idPrefix}-cap`} label="CAP">
          <Input id={`${idPrefix}-cap`} {...form.register('cap')} disabled={disabled} />
        </FormFieldRow>
        <FormFieldRow id={`${idPrefix}-nation`} label="Nazione">
          <Input
            id={`${idPrefix}-nation`}
            {...form.register('nation')}
            disabled={disabled}
          />
        </FormFieldRow>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormFieldRow id={`${idPrefix}-email`} label="Email" error={errors.email?.message}>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            {...form.register('email')}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow id={`${idPrefix}-phone`} label="Telefono">
          <Input
            id={`${idPrefix}-phone`}
            {...form.register('phoneNumber')}
            disabled={disabled}
          />
        </FormFieldRow>
      </div>

      <FormFieldRow id={`${idPrefix}-web`} label="Sito web">
        <Input id={`${idPrefix}-web`} {...form.register('website')} disabled={disabled} />
      </FormFieldRow>
    </div>
  );
}

export function toCompanyCreatePayload(
  values: CompanyFormValues,
  options?: { readonly workspaceId?: string },
) {
  return {
    kind: values.kind,
    name: values.name,
    vatNumber: values.vatNumber,
    fiscalCode: (values.fiscalCode ?? '').toUpperCase(),
    city: values.city ?? '',
    address: values.address ?? '',
    cap: values.cap ?? '',
    nation: values.nation ?? '',
    email: values.email ?? '',
    phoneNumber: values.phoneNumber ?? '',
    website: values.website ?? '',
    logoUrl: '',
    ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
  };
}
