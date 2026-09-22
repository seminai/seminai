import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useMentionSearch } from '@/hooks/use-mention-search';
import type { MentionSearchResultItem } from '@/types/mention';

interface ProductNameAutocompleteProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onPick?: (item: MentionSearchResultItem) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

const MIN_QUERY_LENGTH = 2;

/**
 * Free-text input suggesting product names from the user's own catalog
 * (GET /mentions/search?types=product). Suggestions never gate typing.
 */
export function ProductNameAutocomplete({
  id,
  value,
  onChange,
  onPick,
  disabled,
  placeholder,
}: ProductNameAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debounced = useDebounce(value, 300);
  const query = open && debounced.trim().length >= MIN_QUERY_LENGTH ? debounced : '';
  const { results } = useMentionSearch(query, 'product');
  const showList = open && query.length > 0 && results.length > 0;

  useEffect(() => {
    if (highlighted < 0) return;
    document.getElementById(`${id}-option-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, id]);

  const pick = (item: MentionSearchResultItem) => {
    onChange(item.label);
    onPick?.(item);
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === 'ArrowDown') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      const item = results[highlighted];
      if (item) pick(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? `${id}-listbox` : undefined}
        aria-activedescendant={highlighted >= 0 ? `${id}-option-${highlighted}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      {showList && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {results.map((item, idx) => (
            <li key={`${item.type}-${item.id}`} role="presentation">
              <button
                id={`${id}-option-${idx}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={idx === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => pick(item)}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm hover:bg-accent',
                  idx === highlighted && 'bg-accent',
                )}
              >
                <span className="block truncate">{item.label}</span>
                {item.subtitle ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
