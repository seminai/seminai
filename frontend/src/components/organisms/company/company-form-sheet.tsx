import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { capture } from '@/lib/analytics';
import { useWorkspace } from '@/hooks/use-workspace';

const DEFAULT_WORKSPACE_ID = 'seminai-default';

interface CompanyFormSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (companyId: string) => void;
}

interface CreatedCompanyResponse {
  readonly data?: { readonly company?: { readonly id?: string } };
}

export function CompanyFormSheet({ open, onOpenChange, onCreated }: CompanyFormSheetProps) {
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

  useEffect(() => {
    if (!open) form.reset(defaultValues);
  }, [open, form, defaultValues]);

  const createMutation = usePostCompanies({
    mutation: {
      onSuccess: (response) => {
        void queryClient.invalidateQueries({ queryKey: getGetCompaniesQueryKey() });
        const created = response as unknown as CreatedCompanyResponse;
        const newId = created?.data?.company?.id;
        toast.success('Azienda creata');
        onOpenChange(false);
        if (newId && onCreated) onCreated(newId);
      },
      onError: () => toast.error("Errore durante la creazione dell'azienda"),
    },
  });

  const onSubmit = (values: CompanyFormValues) => {
    capture('company_form_submitted', { mode: 'create' });
    const workspaceId =
      activeWorkspaceId !== DEFAULT_WORKSPACE_ID ? activeWorkspaceId : undefined;
    createMutation.mutate({ data: toCompanyCreatePayload(values, { workspaceId }) });
  };

  const isPending = createMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Aggiungi azienda</SheetTitle>
          <SheetDescription>
            Inserisci i dati anagrafici dell'azienda. Potrai modificarli in seguito.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4"
        >
          <CompanyFormBody
            form={form}
            disabled={isPending}
            lockedKind={lockedKind}
            isExtractingVisura={isExtractingVisura}
            onVisuraFile={(file) => void handleVisuraFile(file)}
          />

          <SheetFooter className="-mx-4 mt-auto px-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isExtractingVisura}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isPending || isExtractingVisura}>
              {isPending ? 'Creazione...' : 'Crea azienda'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
