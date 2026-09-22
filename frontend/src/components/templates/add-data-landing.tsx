import { useNavigate } from '@tanstack/react-router';
import { Upload, CalendarClock, PencilLine } from 'lucide-react';
import { AddDataOptionCard } from '@/components/atoms/add-data-option-card';
import { BackButton } from '@/components/molecules/back-button';
import { getAddDataBackTarget } from '@/lib/add-data-back-target';
import { useWorkspace } from '@/hooks/use-workspace';
import { isManufacturingWorkspace } from '@/types/workspace';

export function AddDataLanding() {
  const navigate = useNavigate();
  const { activeWorkspaceKind } = useWorkspace();
  const isManufacturing = isManufacturingWorkspace(activeWorkspaceKind);

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 py-4">
        <BackButton fallback={getAddDataBackTarget({})} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold">Aggiungi dati</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Scegli come vuoi aggiungere i dati al sistema
          </p>
        </div>
        <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
          <AddDataOptionCard
            icon={Upload}
            title="Carica file"
            description="Carica documenti come DDT, fatture, disciplinari e altro"
            onClick={() => void navigate({ to: '/add-data', search: { type: 'file' } })}
          />
          {!isManufacturing && (
            <AddDataOptionCard
              icon={CalendarClock}
              title="Pianifica"
              description="Crea operazioni manuali o calcola dosaggi automatici"
              onClick={() => void navigate({ to: '/add-data', search: { type: 'plan' } })}
            />
          )}
          <AddDataOptionCard
            icon={PencilLine}
            title="Aggiungi a mano"
            description={
              isManufacturing
                ? 'Crea manualmente aziende, prodotti, clienti e fornitori'
                : 'Crea manualmente aziende, prodotti, campi o unità produttive'
            }
            onClick={() => void navigate({ to: '/add-data', search: { type: 'manual' } })}
          />
        </div>
      </div>
    </main>
  );
}
