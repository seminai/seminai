import { useEffect, useMemo, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ResizablePanelLayoutProps {
  readonly left: React.ReactNode;
  readonly right: React.ReactNode;
  readonly defaultSizes?: [number, number];
  readonly onLayoutChange?: (sizes: readonly number[]) => void;
  readonly mobileMode?: 'tabs' | 'stack';
  readonly mobileBreakpoint?: string;
  readonly leftLabel?: string;
  readonly rightLabel?: string;
}

export function ResizablePanelLayout({
  left,
  right,
  defaultSizes = [50, 50],
  onLayoutChange,
  mobileMode = 'tabs',
  mobileBreakpoint = '(max-width: 768px)',
  leftLabel = 'Sinistra',
  rightLabel = 'Destra',
}: ResizablePanelLayoutProps) {
  const isMobile = useMediaQueryMatch(mobileBreakpoint);
  const firstTabValue = useMemo(() => `left-${toTabValue(leftLabel)}`, [leftLabel]);
  const secondTabValue = useMemo(() => `right-${toTabValue(rightLabel)}`, [rightLabel]);

  if (isMobile && mobileMode === 'tabs') {
    return (
      <Tabs defaultValue={firstTabValue} className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b px-3 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value={firstTabValue} className="flex-1">
              {leftLabel}
            </TabsTrigger>
            <TabsTrigger value={secondTabValue} className="flex-1">
              {rightLabel}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value={firstTabValue} className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden">
          {left}
        </TabsContent>
        <TabsContent value={secondTabValue} className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden">
          {right}
        </TabsContent>
      </Tabs>
    );
  }

  if (isMobile && mobileMode === 'stack') {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{left}</div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{right}</div>
      </div>
    );
  }

  return (
    <Group
      orientation="horizontal"
      className="h-full min-h-0 min-w-0 flex-1"
      onLayoutChange={
        onLayoutChange ? (layout) => onLayoutChange(Object.values(layout) as readonly number[]) : undefined
      }
    >
      <Panel defaultSize={defaultSizes[0]} minSize={20}>
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">{left}</div>
      </Panel>
      <Separator className="group relative w-1.5 bg-border/50 transition-colors hover:bg-primary/30">
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-primary/50" />
      </Separator>
      <Panel defaultSize={defaultSizes[1]} minSize={25}>
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">{right}</div>
      </Panel>
    </Group>
  );
}

function useMediaQueryMatch(mediaQuery: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(mediaQuery).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(mediaQuery);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [mediaQuery]);

  return matches;
}

function toTabValue(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}
