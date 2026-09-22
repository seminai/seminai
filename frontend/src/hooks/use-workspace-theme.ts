import { useEffect } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { useGetWorkspacesId } from '@/generated/api/workspaces/workspaces';
import { extractObject } from '@/lib/api-response';

const THEME_VARS = [
  '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground',
  '--accent', '--accent-foreground',
  '--sidebar-primary', '--sidebar-primary-foreground',
  '--sidebar-accent', '--sidebar-accent-foreground',
  '--ring',
] as const;

/**
 * Applies workspace brand colors as CSS custom properties on :root.
 * Reverts to theme defaults when workspace has no custom colors.
 */
export function useWorkspaceTheme() {
  const { activeWorkspaceId } = useWorkspace();
  const isDefault = activeWorkspaceId === 'seminai-default';

  const { data } = useGetWorkspacesId(activeWorkspaceId, {
    query: { enabled: !isDefault },
  });

  const raw = !isDefault ? extractObject(data?.data, 'workspace') : null;
  const primaryColor = raw?.primaryColor ? String(raw.primaryColor) : null;
  const secondaryColor = raw?.secondaryColor ? String(raw.secondaryColor) : null;
  const accentColor = raw?.accentColor ? String(raw.accentColor) : null;

  useEffect(() => {
    const el = document.documentElement;

    if (isDefault || (!primaryColor && !secondaryColor && !accentColor)) {
      clearThemeOverrides(el);
      return;
    }

    if (primaryColor && primaryColor !== '#000000') {
      el.style.setProperty('--primary', primaryColor);
      el.style.setProperty('--primary-foreground', contrastFg(primaryColor));
      el.style.setProperty('--sidebar-primary', primaryColor);
      el.style.setProperty('--sidebar-primary-foreground', contrastFg(primaryColor));
      el.style.setProperty('--ring', primaryColor);
    }

    if (secondaryColor && secondaryColor !== '#000000') {
      el.style.setProperty('--secondary', secondaryColor);
      el.style.setProperty('--secondary-foreground', contrastFg(secondaryColor));
    }

    if (accentColor && accentColor !== '#000000') {
      el.style.setProperty('--accent', accentColor);
      el.style.setProperty('--accent-foreground', contrastFg(accentColor));
      el.style.setProperty('--sidebar-accent', accentColor);
      el.style.setProperty('--sidebar-accent-foreground', contrastFg(accentColor));
    }

    return () => clearThemeOverrides(el);
  }, [isDefault, primaryColor, secondaryColor, accentColor]);
}

function clearThemeOverrides(el: HTMLElement) {
  for (const v of THEME_VARS) {
    el.style.removeProperty(v);
  }
}

/** Returns white or black foreground depending on the hex color luminance. */
function contrastFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB relative luminance
  const luminance =
    0.2126 * linearize(r) +
    0.7152 * linearize(g) +
    0.0722 * linearize(b);

  return luminance > 0.4 ? 'oklch(0.205 0 0)' : 'oklch(0.985 0 0)';
}

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
