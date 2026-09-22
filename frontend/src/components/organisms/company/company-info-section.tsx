import { useMemo } from "react";
import { EntityPropertyList } from "@/components/molecules/entity-property-list";
import { Section } from "@/components/molecules/section-table";
import { useGetCompaniesId } from "@/generated/api/companies/companies";
import { extractObject } from "@/lib/api-response";
import { CompanyDeleteButton } from "@/components/organisms/company/company-delete-button";
import { COMPANY_KIND_LABELS, parseCompanyKind } from "@/types/company-kind";

interface CompanyInfoSectionProps {
  readonly companyId: string;
}

export function CompanyInfoSection({ companyId }: CompanyInfoSectionProps) {
  const { data: companyRes, isLoading } = useGetCompaniesId(companyId);

  const company = useMemo(() => {
    if (!companyRes?.data) return null;
    const obj = extractObject(companyRes.data, "company");
    if (!obj) return null;
    return {
      name: String(obj.name ?? "-"),
      vatNumber: String(obj.vatNumber ?? "-"),
      cuaa: String(obj.cuaa ?? "-"),
      fiscalCode: String(obj.fiscalCode ?? "-"),
      address: String(obj.address ?? "-"),
      city: String(obj.city ?? "-"),
      cap: String(obj.cap ?? "-"),
      email: String(obj.email ?? "-"),
      phoneNumber: String(obj.phoneNumber ?? "-"),
      kind: parseCompanyKind(obj.kind),
    };
  }, [companyRes]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        Caricamento azienda...
      </div>
    );
  }

  if (!company) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Non ci sono dati
      </p>
    );
  }

  const properties = [
    { label: "Tipo", value: COMPANY_KIND_LABELS[company.kind] },
    { label: "Nome", value: company.name },
    { label: "Partita IVA", value: company.vatNumber },
    ...(company.kind === "AGRICULTURAL"
      ? [{ label: "CUAA", value: company.cuaa }]
      : []),
    { label: "Codice Fiscale", value: company.fiscalCode },
    { label: "Indirizzo", value: company.address },
    { label: "Città", value: company.city },
    { label: "CAP", value: company.cap },
    { label: "Email", value: company.email },
    { label: "Telefono", value: company.phoneNumber },
  ];

  return (
    <Section
      title="Informazioni Azienda"
      action={
        <CompanyDeleteButton companyId={companyId} companyName={company.name} />
      }
    >
      <EntityPropertyList properties={properties} />
    </Section>
  );
}
