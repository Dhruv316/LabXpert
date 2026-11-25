// How the bench screen shares the window: dock height, panel width, the bench box and its scale.
// Pure maths (no React, no DOM), so it can be tested without a browser; BenchView applies the result.
import { BENCH_VIEW } from './catalog';
import { sceneLayout } from './coords';

/** Heights and widths in CSS px at 100% text. The top bar and the shelf are fixed by DESIGN.md / UI_SCREENS §3. */
export const LAYOUT = {
  topBar: 64,
  shelf: 200,
  /** The tutor panel open (UI_SCREENS §3) and its collapsed strip. */
  panelOpen: 360,
  panelStrip: 56,
  /** The narrowest the open panel gets on a narrow window before it would crowd the bench out. */
  panelNarrowest: 264,
  /** The container's own minimum height (`min-h-[34rem]`). */
  minContainer: 544,
  toolbar: 56,
  toolbarCompact: 48,
  status: 40,
  statusCompact: 30,
  /** The 220 px dock of the design (UI_SCREENS §3). */
  dockFull: 220,
  /** The short-window dock: table and graph side by side, the answer box and the button beside them. */
  dockCompact: 141,
  /** The compact dock of a practice attempt, which has no answer box and no Finish button. */
  dockCompactNoFooter: 120,
} as const;

/** The compact dock is used when the full one would leave the bench smaller than this (meter digits need about 0.58, see DECISIONS 10F). */
export const FULL_DOCK_MIN_SCALE = 0.58;

/** With the panel open the bench is never narrower than this share of its design width (scale 0.5). */
export const PANEL_OPEN_MIN_SCALE = 0.5;

/** DESIGN.md §9 and §3: the smallest control and the smallest text in the dock, in screen px. */
export const DOCK_MIN_CONTROL_PX = 44;
export const DOCK_MIN_TEXT_PX = 14;

export type DockMode = 'full' | 'compact';

export interface LayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  panelCollapsed: boolean;
  /** 1 at 100% text, 1.25 at 125% (the root font size over 16 px). */
  textScale: number;
  /** Height of the practice banner above the bench, 0 for none. */
  bannerHeight?: number;
  /** False for a practice attempt: no answer box and no Finish button. */
  hasFooter?: boolean;
}

export interface BenchLayout {
  dockMode: DockMode;
  dockHeight: number;
  toolbarHeight: number;
  statusHeight: number;
  panelWidth: number;
  /** The box the bench scene is fitted into (between the toolbar and the status strip). */
  bench: { width: number; height: number };
  /** Screen px per design unit. */
  scale: number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** The root font size over 16 px, kept between 100% and 200%. */
export function textScaleOf(rootFontPx: number): number {
  return Number.isFinite(rootFontPx) && rootFontPx > 0 ? clamp(rootFontPx / 16, 1, 2) : 1;
}

/** The open panel is as wide as the design says (360 px) while the bench keeps scale 0.5, and narrows to 264 px before it takes more. */
export function openPanelWidth(viewportWidth: number): number {
  const keepBench = viewportWidth - LAYOUT.shelf - BENCH_VIEW.width * PANEL_OPEN_MIN_SCALE;
  return Math.round(clamp(keepBench, LAYOUT.panelNarrowest, LAYOUT.panelOpen));
}

/** Everything the bench screen needs to place its parts for one window size. */
export function benchLayout(input: LayoutInput): BenchLayout {
  const { viewportWidth, viewportHeight, panelCollapsed } = input;
  const banner = input.bannerHeight ?? 0;
  const hasFooter = input.hasFooter ?? true;
  const text = clamp(input.textScale, 1, 2);
  const px = (value: number): number => Math.round(value * text);

  const container = Math.max(viewportHeight - px(LAYOUT.topBar), px(LAYOUT.minContainer));
  const below = container - banner;

  // The full dock stays while the bench keeps a good size with it; otherwise the compact dock and tighter bars take over.
  const fullBench = below - px(LAYOUT.toolbar) - px(LAYOUT.status) - px(LAYOUT.dockFull);
  const compact = fullBench < FULL_DOCK_MIN_SCALE * BENCH_VIEW.height;
  const dockHeight = px(compact ? (hasFooter ? LAYOUT.dockCompact : LAYOUT.dockCompactNoFooter) : LAYOUT.dockFull);
  const toolbarHeight = px(compact ? LAYOUT.toolbarCompact : LAYOUT.toolbar);
  const statusHeight = px(compact ? LAYOUT.statusCompact : LAYOUT.status);

  const panelWidth = panelCollapsed ? LAYOUT.panelStrip : openPanelWidth(viewportWidth);
  const bench = {
    width: Math.max(0, viewportWidth - LAYOUT.shelf - panelWidth),
    height: Math.max(0, below - toolbarHeight - statusHeight - dockHeight),
  };
  const scale = sceneLayout(bench.width, bench.height)?.scale ?? 0;

  return { dockMode: compact ? 'compact' : 'full', dockHeight, toolbarHeight, statusHeight, panelWidth, bench, scale };
}
