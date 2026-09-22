import { useMemo } from 'react';
import { Separator } from '@/components/ui/separator';
import { Section, SimpleTable } from '@/components/molecules/section-table';
import { useGetCompaniesCompanyIdRules } from '@/generated/api/rules/rules';
import { extractArray } from '@/lib/api-response';
import { CompanyMachinesSection } from '@/components/organisms/company/company-machines-section';
import { CompanyFilesSection } from '@/components/organisms/company/company-files-section';
import { SalesMasterDetail } from '@/components/organisms/sales-master-detail';

interface CompanyAgriculturalSectionsProps {
  readonly companyId: string;
}

export function CompanyAgriculturalSections({ companyId }: CompanyAgriculturalSectionsProps) {
  const { data: rulesRes } = useGetCompaniesCompanyIdRules(companyId);

  const rules = useMemo(() => {
    if (!rulesRes?.data) return [];
    return extractArray(rulesRes.data, 'rules').map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? '-'),
    }));
  }, [rulesRes]);

  return (
    <>
      <Separator className="my-6" />
      <CompanyMachinesSection companyId={companyId} />

      <Separator className="my-6" />
      <CompanyFilesSection companyId={companyId} />

      <Separator className="my-6" />
      <Section title="Vendite">
        <SalesMasterDetail companyId={companyId} showTitle={false} />
      </Section>

      <Separator className="my-6" />
      <Section title="Regole" count={rules.length}>
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nessuna regola abbinata</p>
        ) : (
          <SimpleTable headers={['Nome']} rows={rules.map((r) => [r.name])} />
        )}
      </Section>
    </>
  );
}
