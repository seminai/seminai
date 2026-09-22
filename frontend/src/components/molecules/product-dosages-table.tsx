import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ProductDosage } from '@/lib/extract-product-details';

interface ProductDosagesTableProps {
  readonly dosaggi: readonly ProductDosage[];
}

const TH = 'px-3 py-1.5 text-left text-xs font-medium text-muted-foreground';
const TD = 'px-3 py-1.5 text-sm';

function formatDose(min: number | null, max: number | null): string {
  if (min === null && max === null) return '-';
  if (min !== null && max !== null && min !== max) return `${min} – ${max}`;
  return String(min ?? max);
}

export function ProductDosagesTable({ dosaggi }: ProductDosagesTableProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (dosaggi.length === 0) return null;
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Dosaggi per coltura ({dosaggi.length})
      </button>
      {isOpen ? (
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className={TH}>Coltura</th>
                <th className={TH}>Malattia</th>
                <th className={TH}>Dose</th>
                <th className={TH}>UDM</th>
                <th className={TH}>Int. sicurezza (gg)</th>
              </tr>
            </thead>
            <tbody>
              {dosaggi.map((d, index) => (
                <tr key={`${d.coltura}-${index}`} className="border-t">
                  <td className={TD}>{d.coltura}</td>
                  <td className={TD}>{d.malattia ?? '-'}</td>
                  <td className={TD}>{formatDose(d.doseMin, d.doseMax)}</td>
                  <td className={TD}>{d.doseUm ?? '-'}</td>
                  <td className={TD}>{d.intervalloSicurezzaGiorni ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
