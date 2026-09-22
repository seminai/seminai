import { useNavigate } from '@tanstack/react-router';
import { Building2, Package, MapPin, Sprout, Users, type LucideIcon } from 'lucide-react';
import { AddDataOptionCard } from '@/components/atoms/add-data-option-card';
import { BackButton } from '@/components/molecules/back-button';
import { getManualLandingGridClass, isCompactCardLayout } from '@/components/templates/manual-add-grid';
import { getAddDataBackTarget } from '@/lib/add-data-back-target';
import { useWorkspace } from '@/hooks/use-workspace';
import { isManufacturingWorkspace } from '@/types/workspace';

type ManualEntity = 'companies' | 'products' | 'fields' | 'production-units' | 'business-partners';

interface ManualEntityCard {
  readonly entity: ManualEntity;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  /** Agronomic-only cards are hidden in manufacturing workspaces. */
  readonly agronomic?: boolean;
}

const MANUAL_ENTITY_CARDS: readonly ManualEntityCard[] = [
  {
    entity: 'companies',
    icon: Building2,
    title: 'Azienda',
    description: 'Una nuova azienda con dati da visura o anagrafica manuale',
  },
  {
    entity: 'products',
    icon: Package,
    title: 'Prodotti',
    description: 'Prodotti da assegnare a una o più aziende',
  },
  {
    entity: 'fields',
    icon: MapPin,
    title: 'Campi',
    description: 'Campi con dati catastali e parametri agronomici',
    agronomic: true,
  },
  {
    entity: 'production-units',
    icon: Sprout,
    title: 'Unità produttive',
    description: 'Cicli colturali con date e allocazioni sui campi',
    agronomic: true,
  },
  {
    entity: 'business-partners',
    icon: Users,
    title: 'Cliente / Fornitore',
    description: 'Anagrafica cliente o fornitore per ordini e DDT',
  },
] as const;

export function ManualAddLanding() {
  const navigate = useNavigate();
  const { activeWorkspaceKind } = useWorkspace();
  const isManufacturing = isManufacturingWorkspace(activeWorkspaceKind);
  const cards = isManufacturing
    ? MANUAL_ENTITY_CARDS.filter((card) => !card.agronomic)
    : MANUAL_ENTITY_CARDS;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 py-4">
        <BackButton fallback={getAddDataBackTarget({ type: 'manual' })} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold">Aggiungi a mano</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cosa vuoi creare manualmente?
          </p>
        </div>

        <div className={getManualLandingGridClass(cards.length)}>
          {cards.map((card) => (
            <AddDataOptionCard
              key={card.entity}
              icon={card.icon}
              title={card.title}
              description={card.description}
              variant={isCompactCardLayout(cards.length) ? 'compact' : 'default'}
              onClick={() =>
                void navigate({ to: '/add-data', search: { type: 'manual', entity: card.entity } })
              }
            />
          ))}
        </div>
      </div>
    </main>
  );
}
