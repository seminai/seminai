import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SearchableSelectOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly searchKeywords?: string;
}

interface SearchableSelectProps {
  readonly value: string;
  readonly options: readonly SearchableSelectOption[];
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly className?: string;
  readonly popoverClassName?: string;
  readonly searchValue?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly onChange: (value: string | null) => void;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  disabled = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  popoverClassName,
  searchValue,
  onSearchChange,
  onChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? '',
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between font-normal', className)}
          />
        }
      >
        <span className="truncate text-left">{selectedLabel || placeholder}</span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className={cn('w-(--anchor-width) p-0', popoverClassName)}>
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={onSearchChange}
          />
          <CommandList className="max-h-56">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = option.value === value;
                const commandValue = [
                  option.label,
                  option.description,
                  option.searchKeywords,
                  option.value,
                ]
                  .filter(Boolean)
                  .join('::');
                return (
                  <CommandItem
                    key={option.value}
                    value={commandValue}
                    className="items-start py-2"
                    onSelect={() => {
                      if (disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="wrap-break-word whitespace-normal">{option.label}</span>
                      {option.description ? (
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      ) : null}
                    </div>
                    <Check className={cn('ml-auto size-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
