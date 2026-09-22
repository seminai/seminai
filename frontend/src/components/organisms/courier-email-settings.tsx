import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCompanies } from '@/hooks/use-company-options';
import { useCourierEmail, useUpdateCourierEmail } from '@/hooks/use-courier-email';

/** One editable courier-email row, scoped to a single company. */
function CourierEmailRow({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { data: current, isLoading } = useCourierEmail(companyId);
  const update = useUpdateCourierEmail();
  // `draft === null` means "follow the server value"; any string is a local edit.
  const [draft, setDraft] = useState<string | null>(null);
  const serverValue = current ?? '';
  const value = draft ?? serverValue;
  const isDirty = draft !== null && draft !== serverValue;

  const handleSave = () => {
    update.mutate(
      { companyId, courierEmail: value.trim() || null },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success('Email corriere salvata');
        },
        onError: () => toast.error('Salvataggio non riuscito'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{companyName}</span>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          placeholder="corriere@esempio.it"
          value={value}
          disabled={isLoading || update.isPending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="sm" onClick={handleSave} disabled={!isDirty || update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva'}
        </Button>
      </div>
    </div>
  );
}

/** Per-company courier email used as the recipient of the shipping summary. */
export function CourierEmailSettings() {
  const { companies, isLoading } = useCompanies();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
      </div>
    );
  }

  if (companies.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Nessuna azienda disponibile.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Indirizzo a cui inviare il riepilogo giornaliero delle spedizioni (DDT pronti per il
        corriere).
      </p>
      {companies.map((company) => (
        <CourierEmailRow key={company.id} companyId={company.id} companyName={company.name} />
      ))}
    </div>
  );
}
