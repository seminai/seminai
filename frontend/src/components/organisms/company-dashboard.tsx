import { Separator } from '@/components/ui/separator';
import { CompanyInfoSection } from '@/components/organisms/company/company-info-section';
import { CompanyUsersSection } from '@/components/organisms/company/company-users-section';
import { CompanyWarehousesSection } from '@/components/organisms/company/company-warehouses-section';
import { CompanyAgriculturalSections } from '@/components/organisms/company/company-agricultural-sections';
import { useCompanyKind } from '@/hooks/use-company-kind';

interface CompanyDashboardProps {
  readonly companyId: string;
}

export function CompanyDashboard({ companyId }: CompanyDashboardProps) {
  const { isAgricultural, isLoading } = useCompanyKind(companyId);

  if (isLoading) {
    return (
      <div className="flex h-32 flex-1 items-center justify-center text-muted-foreground">
        Caricamento azienda...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <CompanyInfoSection companyId={companyId} />

      <Separator className="my-6" />
      <CompanyUsersSection companyId={companyId} />

      <Separator className="my-6" />
      <CompanyWarehousesSection companyId={companyId} />

      {isAgricultural && <CompanyAgriculturalSections companyId={companyId} />}
    </div>
  );
}
