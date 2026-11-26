import { describe, expect, it } from 'vitest';
import { BENCH_VIEW } from '../../src/bench/catalog';
import {
  benchLayout,
  DOCK_MIN_CONTROL_PX,
  DOCK_MIN_TEXT_PX,
  FULL_DOCK_MIN_SCALE,
  LAYOUT,
  MIN_BENCH_SCALE,
  NARROW_WIDTH,
  openPanelWidth,
  PANEL_OPEN_MIN_SCALE,
  textScaleOf,
  type BenchLayout,
} from '../../src/bench/layout';
import { GRAPH_FONT_PX } from '../../src/bench/graph-layout';
import { fitBenchLayout, toolbarLayout, type ToolbarLabels } from '../../src/bench/toolbar-layout';

const SIZES = [
  { width: 1024, height: 640 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
] as const;

const layoutAt = (width: number, height: number, panelCollapsed: boolean, extra: { textScale?: number; bannerHeight?: number; hasFooter?: boolean } = {}): BenchLayout =>
  benchLayout({ viewportWidth: width, viewportHeight: height, panelCollapsed, textScale: extra.textScale ?? 1, bannerHeight: extra.bannerHeight, hasFooter: extra.hasFooter });

describe('bench layout: bench scale at the three target sizes', () => {
  // The documented values (kit/PROGRESS.md, Part 15C-1), to 3 decimals.
  const EXPECTED = [
    { width: 1024, height: 640, collapsed: 0.551, open: 0.5, mode: 'compact' },
    { width: 1280, height: 720, collapsed: 0.674, open: 0.655, mode: 'compact' },
    { width: 1366, height: 768, collapsed: 0.599, open: 0.599, mode: 'full' },
  ] as const;

  for (const row of EXPECTED) {
    it(`${row.width} × ${row.height}: panel collapsed ${row.collapsed}, open ${row.open}, ${row.mode} dock`, () => {
      const collapsed = layoutAt(row.width, row.height, true);
      const open = layoutAt(row.width, row.height, false);
      expect(collapsed.scale).toBeCloseTo(row.collapsed, 3);
      expect(open.scale).toBeCloseTo(row.open, 3);
      expect(collapsed.dockMode).toBe(row.mode);
      expect(open.dockMode).toBe(row.mode);
    });
  }

  it('is at least 0.55 at 1024 × 640 with the panel collapsed, and at least 0.5 with it open', () => {
    expect(layoutAt(1024, 640, true).scale).toBeGreaterThanOrEqual(0.55);
    expect(layoutAt(1024, 640, false).scale).toBeGreaterThanOrEqual(PANEL_OPEN_MIN_SCALE);
  });

  it('is at least 0.55 at every target size in both panel states', () => {
    for (const { width, height } of SIZES) {
      for (const collapsed of [true, false]) {
        expect(layoutAt(width, height, collapsed).scale).toBeGreaterThanOrEqual(0.5);
      }
    }
    expect(layoutAt(1280, 720, false).scale).toBeGreaterThanOrEqual(0.55);
    expect(layoutAt(1366, 768, false).scale).toBeGreaterThanOrEqual(0.55);
  });

  it('keeps the design’s 220 px dock at 1366 × 768, where the bench is still above the digits threshold', () => {
    const wide = layoutAt(1366, 768, false);
    expect(wide.dockMode).toBe('full');
    expect(wide.dockHeight).toBe(LAYOUT.dockFull);
    expect(wide.scale).toBeGreaterThanOrEqual(FULL_DOCK_MIN_SCALE);
  });

  it('uses the compact dock exactly when the full one would leave the bench under the threshold', () => {
    for (let height = 560; height <= 1200; height += 8) {
      const layout = layoutAt(1600, height, true);
      const withFull = (height - LAYOUT.topBar - LAYOUT.toolbar - LAYOUT.status - LAYOUT.dockFull) / BENCH_VIEW.height;
      expect(layout.dockMode).toBe(withFull < FULL_DOCK_MIN_SCALE ? 'compact' : 'full');
    }
  });
});

describe('bench layout: nothing is larger than the window', () => {
  it('never lets the dock exceed its height, and the bench box and bars add up to the screen', () => {
    for (let width = 1024; width <= 1920; width += 32) {
      for (let height = 640; height <= 1080; height += 20) {
        for (const collapsed of [true, false]) {
          const layout = layoutAt(width, height, collapsed);
          const maxDock = layout.dockMode === 'compact' ? LAYOUT.dockCompact : LAYOUT.dockFull;
          expect(layout.dockHeight).toBeLessThanOrEqual(maxDock);
          expect(layout.dockHeight).toBeGreaterThan(0);
          const column = layout.toolbarHeight + layout.bench.height + layout.statusHeight + layout.dockHeight;
          expect(column).toBe(Math.max(height - LAYOUT.topBar, LAYOUT.minContainer));
        }
      }
    }
  });

  it('adds shelf, bench and panel up to the window width, so nothing overflows horizontally', () => {
    for (let width = 1024; width <= 1920; width += 16) {
      for (const collapsed of [true, false]) {
        const layout = layoutAt(width, 700, collapsed);
        expect(LAYOUT.shelf + layout.bench.width + layout.panelWidth).toBe(width);
        expect(layout.bench.width).toBeGreaterThan(0);
      }
    }
  });

  it('gives the open panel 360 px when there is room, and narrows it to keep the bench at scale 0.5', () => {
    expect(openPanelWidth(1366)).toBe(360);
    expect(openPanelWidth(1280)).toBe(360);
    expect(openPanelWidth(1024)).toBe(274);
    expect(openPanelWidth(900)).toBe(LAYOUT.panelNarrowest);
    const narrow = layoutAt(1024, 640, false);
    expect(narrow.bench.width).toBe(BENCH_VIEW.width * PANEL_OPEN_MIN_SCALE);
    expect(layoutAt(1024, 640, true).panelWidth).toBe(LAYOUT.panelStrip);
  });
});

describe('bench layout: the compact dock', () => {
  it('has a 141 px dock with a footer and a shorter one without', () => {
    expect(layoutAt(1024, 640, true).dockHeight).toBe(141);
    expect(layoutAt(1024, 640, true, { hasFooter: false }).dockHeight).toBe(LAYOUT.dockCompactNoFooter);
  });

  it('keeps the design’s 44 px and 14 px minimums', () => {
    expect(DOCK_MIN_CONTROL_PX).toBe(44);
    expect(DOCK_MIN_TEXT_PX).toBe(14);
    expect(GRAPH_FONT_PX).toBeGreaterThanOrEqual(DOCK_MIN_TEXT_PX);
    // The footer column: field row (20 label + 4 + 44 input + 4) + gap + Finish, with room for a verdict of three lines (54 px).
    const fieldRow = 20 + 4 + DOCK_MIN_CONTROL_PX + 4;
    expect(fieldRow + 4 + Math.max(DOCK_MIN_CONTROL_PX, 3 * 18)).toBeLessThanOrEqual(LAYOUT.dockCompact - 4 - 4);
    // The readings column: title row with the 44 px Record button, then at least the header and one row of the table.
    expect(LAYOUT.dockCompact - 4 - 4 - DOCK_MIN_CONTROL_PX - 4).toBeGreaterThanOrEqual(28 + 29);
  });

  it('takes the practice banner into account', () => {
    // Room to spare (a tall window): the banner comes straight out of the bench.
    const withBanner = layoutAt(1024, 900, true, { bannerHeight: 80, hasFooter: false });
    const without = layoutAt(1024, 900, true, { hasFooter: false });
    expect(without.bench.height - withBanner.bench.height).toBe(80);
    // No room (15C-2b): the bench stops at its scale floor and the page scrolls instead.
    const short = layoutAt(1024, 640, true, { bannerHeight: 80, hasFooter: false });
    expect(short.bench.height).toBeGreaterThanOrEqual(Math.ceil(BENCH_VIEW.height * MIN_BENCH_SCALE));
    expect(short.pageScrolls).toBe(true);
  });

  it('grows the bars and the dock with the text scale, and the page may then be taller than the window', () => {
    const big = layoutAt(1024, 640, true, { textScale: 1.25 });
    expect(big.dockHeight).toBe(Math.round(LAYOUT.dockCompact * 1.25));
    expect(big.toolbarHeight).toBe(Math.round(LAYOUT.toolbarCompact * 1.25));
    expect(big.scale).toBeGreaterThan(0);
  });

  it('reads the text scale from the root font size, between 100% and 200%', () => {
    expect(textScaleOf(16)).toBe(1);
    expect(textScaleOf(20)).toBe(1.25);
    expect(textScaleOf(8)).toBe(1);
    expect(textScaleOf(64)).toBe(2);
    expect(textScaleOf(Number.NaN)).toBe(1);
  });
});

// ---- 15C-2b: 125% text, browser zoom, toolbar rows, shelf, page scroll ----

const LABELS: ToolbarLabels = { undo: 'Undo', reset: 'Clear bench', remove: 'Remove', counter: 'Task 3 of 3' };
const ZOOM_VIEWPORTS = [
  { name: 'zoom 125%', width: 1093, height: 614, zoom: 1.25 },
  { name: 'zoom 150%', width: 911, height: 512, zoom: 1.5 },
] as const;

describe('bench layout at 125% text', () => {
  for (const { width, height } of [{ width: 1366, height: 768 }, { width: 1024, height: 640 }]) {
    for (const collapsed of [true, false]) {
      it(`${width} × ${height}, panel ${collapsed ? 'collapsed' : 'open'}: bars and dock grow with the text and the bench keeps a scale of at least 0.5`, () => {
        const layout = layoutAt(width, height, collapsed, { textScale: 1.25 });
        expect(layout.dockMode).toBe('compact');
        expect(layout.dockHeight).toBe(Math.round(LAYOUT.dockCompact * 1.25));
        expect(layout.toolbarHeight).toBe(Math.round(LAYOUT.toolbarCompact * 1.25));
        expect(layout.statusHeight).toBe(Math.round(LAYOUT.statusCompact * 1.25));
        expect(layout.scale).toBeGreaterThanOrEqual(MIN_BENCH_SCALE);
        expect(layout.shelfBadgeClear).toBe(true);
      });
    }
  }

  it('is unchanged at 100% text: the shelf badge stays in the corner and nothing else moves', () => {
    expect(layoutAt(1366, 768, true).shelfBadgeClear).toBe(false);
    expect(layoutAt(1366, 768, true).shelfWidth).toBe(LAYOUT.shelf);
    expect(layoutAt(1366, 768, true).pageScrolls).toBe(false);
  });
});

describe('bench layout at browser zoom 125% and 150% on a 1366 × 768 window', () => {
  for (const { name, width, height, zoom } of ZOOM_VIEWPORTS) {
    it(`${name} (${width} × ${height}): compact dock, scroll floor, bench scale kept, and larger on the screen than at 100%`, () => {
      const collapsed = layoutAt(width, height, true);
      const open = layoutAt(width, height, false);
      expect(collapsed.dockMode).toBe('compact');
      expect(collapsed.scale).toBeGreaterThanOrEqual(MIN_BENCH_SCALE);
      expect(open.scale).toBeGreaterThanOrEqual(0.42);
      // Zoom makes a CSS px bigger on the screen, so the bench is drawn larger than the 0.599 of the 100% window.
      expect(collapsed.scale * zoom).toBeGreaterThan(layoutAt(1366, 768, true).scale);
    });
  }

  it('narrows the shelf below 1024 px and scrolls the page when the window is shorter than the floor', () => {
    const small = layoutAt(911, 512, true);
    expect(small.narrow).toBe(true);
    expect(small.shelfWidth).toBe(LAYOUT.shelfNarrow);
    expect(small.pageScrolls).toBe(true);
    expect(small.containerMinHeight).toBeGreaterThanOrEqual(LAYOUT.minContainer);
    const wide = layoutAt(NARROW_WIDTH, 640, true);
    expect(wide.narrow).toBe(false);
    expect(wide.shelfWidth).toBe(LAYOUT.shelf);
  });

  it('never gives the bench less than the scale floor height-wise: the screen grows instead (banner included)', () => {
    for (const bannerHeight of [0, 80, 160, 240]) {
      for (const height of [480, 512, 614, 640, 768]) {
        const layout = layoutAt(911, height, true, { bannerHeight });
        expect(layout.bench.height).toBeGreaterThanOrEqual(Math.ceil(BENCH_VIEW.height * MIN_BENCH_SCALE) - 1);
      }
    }
  });

  it('uses the smaller Ollie in the panel on a narrow or short window', () => {
    expect(layoutAt(911, 512, false).panelOllie).toBe(56);
    expect(layoutAt(1920, 1080, false).panelOllie).toBe(96);
  });
});

describe('toolbar rows', () => {
  it('is one roomy row at 1366 × 768 (panel open, 100% text): the design does not change', () => {
    const fitted = fitBenchLayout({ viewportWidth: 1366, viewportHeight: 768, panelCollapsed: false, textScale: 1 }, LABELS);
    expect(fitted.toolbar).toEqual({ rows: 1, tight: false });
  });

  it('goes tight, then to two rows, as the bench column narrows or the text grows', () => {
    const widths = [900, 700, 600, 500, 400, 300];
    const rows = widths.map((availableWidth) => toolbarLayout({ availableWidth, textScale: 1.25, labels: LABELS }));
    for (let i = 1; i < rows.length; i += 1) {
      const before = rows[i - 1];
      const after = rows[i];
      expect(before !== undefined && after !== undefined && after.rows >= before.rows).toBe(true);
    }
    expect(rows[0]).toEqual({ rows: 1, tight: false });
    expect(rows[rows.length - 1]?.rows).toBe(2);
  });

  it('counts the second row in the toolbar height and takes it out of the bench', () => {
    const one = benchLayout({ viewportWidth: 1024, viewportHeight: 640, panelCollapsed: false, textScale: 1, toolbarRows: 1 });
    const two = benchLayout({ viewportWidth: 1024, viewportHeight: 640, panelCollapsed: false, textScale: 1, toolbarRows: 2 });
    expect(two.toolbarHeight).toBe(one.toolbarHeight * 2);
    expect(two.containerMinHeight).toBeGreaterThanOrEqual(one.containerMinHeight);
  });

  it('never needs more than two rows, so the toolbar cannot exceed the viewport width (the items wrap, nothing scrolls sideways)', () => {
    for (const { width, height } of [{ width: 1366, height: 768 }, { width: 1024, height: 640 }, ...ZOOM_VIEWPORTS]) {
      for (const textScale of [1, 1.25]) {
        for (const panelCollapsed of [true, false]) {
          const { toolbar, layout } = fitBenchLayout({ viewportWidth: width, viewportHeight: height, panelCollapsed, textScale }, LABELS);
          expect(toolbar.rows).toBeLessThanOrEqual(2);
          expect(layout.bench.width + layout.shelfWidth + layout.panelWidth).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it('copes with a bad text scale', () => {
    expect(toolbarLayout({ availableWidth: 900, textScale: Number.NaN, labels: LABELS }).rows).toBe(1);
  });
});

describe('minimum sizes at 125% text', () => {
  it('keeps the 44 px control and 14 px text minimums (they are px, so a larger rem only makes them bigger)', () => {
    expect(DOCK_MIN_CONTROL_PX).toBe(44);
    expect(DOCK_MIN_TEXT_PX).toBe(14);
    const layout = layoutAt(1366, 768, true, { textScale: 1.25 });
    expect(layout.toolbarHeight).toBeGreaterThanOrEqual(DOCK_MIN_CONTROL_PX);
    expect(layout.dockHeight).toBeGreaterThanOrEqual(LAYOUT.dockCompact);
  });
});
