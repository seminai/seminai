import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { useNominatimSearch, type NominatimResult } from '@/hooks/use-nominatim-search';

export interface MapLocationSelection {
  readonly bbox: [number, number, number, number];
  readonly latlng: [number, number];
  readonly label: string;
}

interface MapLocationSearchProps {
  readonly onSelect: (selection: MapLocationSelection) => void;
  readonly disabled?: boolean;
}

export function MapLocationSearch({ onSelect, disabled }: MapLocationSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(query, 300);
  const { data: results, isFetching, isError } = useNominatimSearch(debounced);

  const handleSelect = (result: NominatimResult) => {
    onSelect({
      bbox: result.bbox,
      latlng: [result.lat, result.lon],
      label: result.displayName,
    });
    setQuery(result.displayName);
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Cerca località..."
          disabled={disabled}
          className="pl-7"
        />
        {isFetching && (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && debounced.length >= 3 && (
        <div className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {isError && (
            <div className="px-3 py-2 text-xs text-destructive">Errore di ricerca</div>
          )}
          {!isError && results && results.length === 0 && !isFetching && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nessun risultato</div>
          )}
          {results?.map((result, idx) => (
            <button
              key={`${result.lat}-${result.lon}-${idx}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(result)}
              className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-accent"
            >
              {result.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
