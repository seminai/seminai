import { useEffect, useRef, type RefObject } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Building2, Package, MapPin, Sprout, Warehouse, FileText, Loader2 } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { MentionEntityType, MentionSearchResultItem } from '@/types/mention';
import { MENTION_TYPE_LABELS } from '@/types/mention';

interface MentionAutocompleteProps {
  readonly results: readonly MentionSearchResultItem[];
  readonly isLoading: boolean;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly preferredSide: 'top' | 'bottom';
  readonly onSelect: (item: MentionSearchResultItem) => void;
  readonly onClose: () => void;
}

const TYPE_ICONS: Record<MentionEntityType, typeof Building2> = {
  company: Building2,
  product: Package,
  field: MapPin,
  production_unit: Sprout,
  stock: Warehouse,
  file: FileText,
};

/**
 * Dropdown component for mention autocomplete results.
 * Groups results by entity type with icons and keyboard navigation.
 */
export function MentionAutocomplete({
  results,
  isLoading,
  anchorRef,
  preferredSide,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorRef, onClose]);

  const grouped = groupByType(results);

  return (
    <PopoverPrimitive.Root open modal={false}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchorRef}
          side={preferredSide}
          sideOffset={8}
          align="start"
          collisionAvoidance={{ side: 'flip', align: 'shift' }}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            className={cn(
              'z-50 w-(--anchor-width) max-w-md origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
            )}
          >
            <Command
              className="rounded-lg border shadow-lg"
              shouldFilter={false}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
            >
              <CommandList className="max-h-(--available-height)">
                {isLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Ricerca...</span>
                  </div>
                )}

                {!isLoading && results.length === 0 && (
                  <CommandEmpty>Nessun risultato</CommandEmpty>
                )}

                {!isLoading &&
                  Object.entries(grouped).map(([type, items]) => {
                    const entityType = type as MentionEntityType;
                    return (
                      <CommandGroup key={type} heading={MENTION_TYPE_LABELS[entityType]}>
                        {items.map((item) => {
                          const Icon = TYPE_ICONS[entityType];
                          return (
                            <CommandItem
                              key={`${item.type}-${item.id}`}
                              value={`${item.type}-${item.id}`}
                              onSelect={() => onSelect(item)}
                              className="cursor-pointer"
                            >
                              <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="flex flex-col overflow-hidden">
                                <span className="truncate text-sm">{item.label}</span>
                                {item.subtitle && (
                                  <span className="truncate text-xs text-muted-foreground">
                                    {item.subtitle}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    );
                  })}
              </CommandList>
            </Command>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function groupByType(
  items: readonly MentionSearchResultItem[],
): Record<string, MentionSearchResultItem[]> {
  const groups: Record<string, MentionSearchResultItem[]> = {};
  for (const item of items) {
    if (!groups[item.type]) {
      groups[item.type] = [];
    }
    groups[item.type].push(item);
  }
  return groups;
}
