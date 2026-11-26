// When the bench toolbar needs a second row. Pure estimate (no DOM), like the top bar's rule in ui/shell/topbar-layout.ts.
// The worst case is always assumed (Undo, Clear bench, Remove and the task counter all present), so the toolbar does not change
// height when a part is selected and the bench does not jump.
import { benchLayout, type BenchLayout, type LayoutInput } from './layout';

/** Rough width of one character of the button font (Fredoka 16 px) and of the counter font (Nunito 14 px bold), at 100% text. */
const BUTTON_CHAR_PX = 9;
const COUNTER_CHAR_PX = 8;
const ICON_PX = 20;
const GAP_PX = 8;
const BAR_PADDING_PX = 24;
/** Button side padding: `px-6` normally, `px-3` when tight. */
const PAD_ROOMY_PX = 24;
const PAD_TIGHT_PX = 12;
/** The dashed frame around Remove (border 2 + `px-2`), and the counter's border and `px-3`. */
const SELECTION_FRAME_PX = 20;
const COUNTER_FRAME_PX = 28;

export interface ToolbarLabels {
  undo: string;
  reset: string;
  remove: string;
  /** The longest the task or practice counter reads, e.g. "Task 2 of 2". */
  counter: string;
}

export interface ToolbarInput {
  /** Width of the bench column (the toolbar's own width) in CSS px. */
  availableWidth: number;
  textScale: number;
  labels: ToolbarLabels;
}

export interface ToolbarLayout {
  /** 1 when everything fits on one row, otherwise 2 (the items wrap; nothing overlaps or scrolls sideways). */
  rows: 1 | 2;
  /** Narrow padding on the buttons, used whenever the roomy padding would need a second row. */
  tight: boolean;
}

const buttonWidth = (label: string, pad: number, scale: number): number =>
  ICON_PX + GAP_PX + label.length * BUTTON_CHAR_PX * scale + 2 * pad * scale;

function contentWidth(input: ToolbarInput, pad: number): number {
  const { labels, textScale } = input;
  const buttons = [labels.undo, labels.reset, labels.remove].reduce((sum, label) => sum + buttonWidth(label, pad, textScale), 0);
  const counter = labels.counter.length * COUNTER_CHAR_PX * textScale + COUNTER_FRAME_PX;
  return BAR_PADDING_PX + buttons + SELECTION_FRAME_PX + counter + GAP_PX * 4;
}

export function toolbarLayout(input: ToolbarInput): ToolbarLayout {
  const scale = Number.isFinite(input.textScale) && input.textScale > 0 ? input.textScale : 1;
  const safe = { ...input, textScale: scale };
  if (contentWidth(safe, PAD_ROOMY_PX) <= input.availableWidth) return { rows: 1, tight: false };
  if (contentWidth(safe, PAD_TIGHT_PX) <= input.availableWidth) return { rows: 1, tight: true };
  return { rows: 2, tight: true };
}

export interface FittedLayout {
  layout: BenchLayout;
  toolbar: ToolbarLayout;
}

/** The bench layout with the toolbar's rows worked in: the toolbar's width is the bench column's, which the first pass gives. */
export function fitBenchLayout(input: LayoutInput, labels: ToolbarLabels): FittedLayout {
  const first = benchLayout({ ...input, toolbarRows: 1 });
  const toolbar = toolbarLayout({ availableWidth: first.bench.width, textScale: input.textScale, labels });
  return { layout: toolbar.rows === 1 ? first : benchLayout({ ...input, toolbarRows: toolbar.rows }), toolbar };
}
