import { useForm } from 'react-hook-form';
import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  usePostCompanies,
  getGetCompaniesQueryKey,
} from '@/generated/api/companies/companies';
import {
  companySchema,
  EMPTY_COMPANY_VALUES,
  type CompanyFormValues,
} from '@/components/organisms/company/company-schema';
import {
  CompanyFormBody,
  toCompanyCreatePayload,
} from '@/components/organisms/company/company-form-body';
import { useCompanyVisuraExtraction } from '@/components/organisms/company/use-company-visura-extraction';
import { useWorkspace } from '@/hooks/use-workspace';

const DEFAULT_WORKSPACE_ID = 'seminai-default';

interface CreatedCompanyResponse {
  readonly data?: { readonly company?: { readonly id?: string } };
}

export function CompanySingleForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeWorkspaceId, activeWorkspaceKind } = useWorkspace();
  const lockedKind = activeWorkspaceKind ?? undefined;
  const defaultValues = useMemo(
    () => (lockedKind ? { ...EMPTY_COMPANY_VALUES, kind: lockedKind } : EMPTY_COMPANY_VALUES),
    [lockedKind],
  );

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues,
  });
  const { isExtractingVisura, handleVisuraFile } = useCompanyVisuraExtraction(form);

  const mutation = usePostCompanies({
    mutation: {
      onSuccess: (response) => {
        void queryClient.invalidateQueries({ queryKey: getGetCompaniesQueryKey() });
        const created = response as unknown as CreatedCompanyResponse;
        toast.success('Azienda creata');
        const newId = created?.data?.company?.id;
        if (newId) {
          void navigate({ to: '/archivio', search: { companyId: newId } });
        } else {
          void navigate({ to: '/add-data', search: { type: 'manual' } });
        }
      },
      onError: () => toast.error("Errore durante la creazione dell'azienda"),
    },
  });

  const isPending = mutation.isPending;

  const onSubmit = (values: CompanyFormValues) => {
    const workspaceId =
      activeWorkspaceId !== DEFAULT_WORKSPACE_ID ? activeWorkspaceId : undefined;
    mutation.mutate({ data: toCompanyCreatePayload(values, { workspaceId }) });
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto flex max-w-2xl flex-col gap-4"
    >
      <div className="rounded-lg border bg-card p-4">
        <CompanyFormBody
          form={form}
          disabled={isPending}
          lockedKind={lockedKind}
          isExtractingVisura={isExtractingVisura}
          onVisuraFile={(file) => void handleVisuraFile(file)}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigate({ to: '/add-data', search: { type: 'manual' } })}
          disabled={isPending || isExtractingVisura}
        >
          Annulla
        </Button>
        <Button type="submit" disabled={isPending || isExtractingVisura}>
          {isPending ? 'Creazione...' : 'Crea azienda'}
        </Button>
      </div>
    </form>
  );
}
