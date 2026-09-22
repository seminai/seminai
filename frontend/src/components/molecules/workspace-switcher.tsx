import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, Check, Plus, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceModel } from '@/types/prisma';
import {
  isManufacturingWorkspace,
  WORKSPACE_KIND_LABELS,
  type WorkspaceKind,
} from '@/types/workspace';

export type WorkspaceSwitcherItem = Pick<WorkspaceModel, 'id' | 'name' | 'logoUrl'>;

interface WorkspaceSwitcherProps {
  readonly workspaces: readonly WorkspaceSwitcherItem[];
  readonly activeId: string;
  readonly activeKind?: WorkspaceKind | null;
  readonly onSwitch: (id: string) => void;
  readonly onCreate: () => void;
  readonly onSettings: () => void;
  readonly collapsed?: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  activeKind,
  onSwitch,
  onCreate,
  onSettings,
  collapsed,
}: WorkspaceSwitcherProps) {
  const [search, setSearch] = useState('');
  const active = workspaces.find((w) => w.id === activeId);

  const filtered = workspaces.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()),
  );

  const avatar = active?.logoUrl ? (
    <img src={active.logoUrl} alt={active.name} className="h-7 w-7 shrink-0 rounded object-contain" />
  ) : (
    <WorkspaceAvatar name={active?.name ?? ''} />
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            title={collapsed ? active?.name : undefined}
            className={cn(
              'flex min-w-0 items-center rounded-lg transition-colors hover:bg-accent/50',
              collapsed ? 'justify-center px-1.5 py-1.5' : 'gap-2.5 px-2 py-1.5',
            )}
          />
        }
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="truncate text-sm font-semibold">
              {active?.name ?? 'Workspace'}
            </span>
            {isManufacturingWorkspace(activeKind) && activeId !== 'seminai-default' && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {WORKSPACE_KIND_LABELS.MANUFACTURING}
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start" side="bottom">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca workspace..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <Separator />

        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Nessun workspace trovato
            </p>
          ) : (
            filtered.map((ws) => (
              <Button
                key={ws.id}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-9 w-full justify-start gap-2.5 text-sm',
                  ws.id === activeId && 'bg-accent',
                )}
                onClick={() => onSwitch(ws.id)}
              >
                {ws.logoUrl ? (
                  <img src={ws.logoUrl} alt={ws.name} className="h-5 w-5 shrink-0 rounded" />
                ) : (
                  <WorkspaceAvatar name={ws.name} size="sm" />
                )}
                <span className="truncate">{ws.name}</span>
                {ws.id === activeId && (
                  <Check className="ml-auto h-4 w-4 shrink-0" />
                )}
              </Button>
            ))
          )}
        </div>

        <Separator />

        <div className="p-1">
          {activeId !== 'seminai-default' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start gap-2.5 text-sm"
              onClick={onSettings}
            >
              <Settings className="h-4 w-4" />
              Impostazioni
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start gap-2.5 text-sm"
            onClick={onCreate}
          >
            <Plus className="h-4 w-4" />
            Crea nuovo workspace
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorkspaceAvatar({
  name,
  size = 'md',
}: {
  readonly name: string;
  readonly size?: 'sm' | 'md';
}) {
  const initial = name.charAt(0).toUpperCase();
  const dim = size === 'sm' ? 'h-5 w-5 text-xs' : 'h-6 w-6 text-xs';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded bg-primary/10 font-semibold text-primary',
        dim,
      )}
    >
      {initial}
    </span>
  );
}
