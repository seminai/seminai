import { useState } from 'react';
import { toast } from 'sonner';
import { EntityPropertyList, type PropertyItem } from '@/components/molecules/entity-property-list';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import type { ProductDetails } from '@/lib/extract-product-details';
import { getLabelsByProduct } from '@/generated/api/labels/labels';

interface PesticideDetailsSectionProps {
  readonly details: ProductDetails;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly onOpenLabel: (url: string, fileName: string) => void;
}

export function PesticideDetailsSection({
  details,
  productName,
  registrationNumber,
  onOpenLabel,
}: PesticideDetailsSectionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const properties: PropertyItem[] = [
    { label: 'Principio attivo', value: details.principioAttivo },
    { label: 'Formulazione', value: details.formulazione },
    { label: 'Composizione', value: details.composizione },
    { label: "Meccanismo d'azione (FRAC)", value: details.meccanismoFrac },
    { label: 'Titolare', value: details.titolare },
    { label: 'Caratteristiche', value: details.caratteristiche },
  ];
  const hasAnyValue = properties.some((p) => p.value !== null && p.value !== '');
  const hasValidIdentity =
    productName.trim().length > 0 && registrationNumber.trim().length > 0 && registrationNumber !== '-';
  if (!hasAnyValue && !hasValidIdentity) return null;

  const handleOpenLabel = async () => {
    if (!hasValidIdentity || isLoading) return;
    setIsLoading(true);
    try {
      const response = await getLabelsByProduct({ name: productName, regNumber: registrationNumber });
      if (response.status !== 200) {
        toast.error('Etichetta non disponibile per questo prodotto.');
        return;
      }
      const payload = (response.data as unknown as { data?: { sourceUrl?: string } } | undefined)?.data;
      const sourceUrl = typeof payload?.sourceUrl === 'string' ? payload.sourceUrl.trim() : '';
      if (!sourceUrl) {
        toast.error('Etichetta non disponibile per questo prodotto.');
        return;
      }
      onOpenLabel(sourceUrl, `Etichetta ${productName}`);
    } catch {
      toast.error("Errore durante l'apertura dell'etichetta.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Dettagli fitofarmaco
      </h3>
      <EntityPropertyList properties={properties} />
      {hasValidIdentity ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={handleOpenLabel}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="mr-1 h-3.5 w-3.5" />
          )}
          Apri etichetta
        </Button>
      ) : null}
    </section>
  );
}
