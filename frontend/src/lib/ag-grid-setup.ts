import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type Theme,
} from "ag-grid-community";
import { CellSelectionModule } from "ag-grid-enterprise";

let modulesRegistered = false;

/**
 * Register all AG Grid community modules. Safe to call multiple times.
 * Called lazily by the Excel-view components so the bundle stays unaffected
 * when the user keeps the default React/TanStack table view.
 */
export function registerAgGridModules(): void {
  if (modulesRegistered) return;
  ModuleRegistry.registerModules([AllCommunityModule, CellSelectionModule]);
  modulesRegistered = true;
}

/**
 * Seminai AG Grid theme. Colors follow the shadcn/Tailwind tokens used across
 * the app so the Excel view stays visually consistent with the default UI.
 *
 * Uses CSS variables where possible: AG Grid reads them at render time, so
 * dark mode and custom branding keep working without theme rebuilds.
 */
export const seminaiAgGridTheme: Theme = themeQuartz.withParams({
  accentColor: "var(--primary, oklch(0.55 0.2 260))",
  backgroundColor: "var(--background, oklch(1 0 0))",
  foregroundColor: "var(--foreground, oklch(0.145 0 0))",
  chromeBackgroundColor: "var(--background, oklch(1 0 0))",
  menuBackgroundColor: "var(--background, oklch(1 0 0))",
  menuTextColor: "var(--foreground, oklch(0.145 0 0))",
  menuBorder: {
    style: "solid",
    width: 1,
    color: "var(--border, oklch(0.922 0 0))",
  },
  popupShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
  headerBackgroundColor: "var(--muted, oklch(0.97 0 0))",
  headerTextColor: "var(--foreground, oklch(0.145 0 0))",
  borderColor: "var(--border, oklch(0.922 0 0))",
  rowHoverColor: "var(--accent, oklch(0.97 0 0))",
  selectedRowBackgroundColor: "var(--accent, oklch(0.97 0 0))",
  rangeSelectionBorderColor: "var(--primary, oklch(0.55 0.2 260))",
  rangeSelectionBackgroundColor:
    "color-mix(in oklch, var(--primary, oklch(0.55 0.2 260)) 12%, transparent)",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  rowBorder: true,
  columnBorder: false,
  wrapperBorderRadius: 8,
  cellHorizontalPadding: 12,
  headerHeight: 40,
  rowHeight: 40,
});
