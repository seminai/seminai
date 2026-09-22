import { useNavigate } from '@tanstack/react-router';
import { ClipboardList, Bot } from 'lucide-react';
import { AddDataOptionCard } from '@/components/atoms/add-data-option-card';
import { BackButton } from '@/components/molecules/back-button';
import { getAddDataBackTarget } from '@/lib/add-data-back-target';

export function PlanModePicker() {
  const navigate = useNavigate();

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 py-4">
        <BackButton fallback={getAddDataBackTarget({ type: 'plan' })} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold">Pianifica operazioni</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Scegli la modalita di pianificazione
          </p>
        </div>
        <div className="grid w-full max-w-lg grid-cols-2 gap-6">
          <AddDataOptionCard
            icon={ClipboardList}
            title="Manuale"
            description="Definisci le operazioni riga per riga e crea direttamente i job"
            onClick={() =>
              void navigate({ to: '/add-data', search: { type: 'plan', mode: 'manual' } })
            }
          />
          <AddDataOptionCard
            icon={Bot}
            title="Automatico"
            description="Importa i prodotti e lascia all'AI il calcolo dei dosaggi"
            onClick={() =>
              void navigate({ to: '/add-data', search: { type: 'plan', mode: 'auto' } })
            }
          />
        </div>
      </div>
    </main>
  );
}
