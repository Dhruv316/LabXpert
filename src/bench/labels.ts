// Part text that must stay readable at any bench size: the meter digits, the resistor's value, the
// supply's display and the switch's name. Pure, so the sizing rule is testable without a browser.
import type { ComponentType } from '../model/types';
import tokens from '../spec/design-tokens.json';
import type { SlotEdge } from './overlay';

/** DESIGN.md §3: nothing is ever below 14 px on screen. */
export const MIN_TEXT_PX = tokens.typeScale.small.size;

/**
 * Font sizes the kit pictures use for these texts, in design units (the SVGs' own font-size values;
 * the meter digits use the meterDigits token). At bench scale 1 a label is exactly as before.
 */
export const LABEL_DESIGN_SIZE = {
  meter: tokens.typeScale.meterDigits.size,
  resistor: 17,
  supply: 22,
  switch: 13,
} as const;

/**
 * Screen px for a label: the size it has when drawn with the bench, but never under 14 px. `scale` is
 * the bench's screen px per design unit. Before the bench is measured (no scale) the design size is used.
 */
export function labelPx(designSize: number, scale: number): number {
  if (!(scale > 0)) return Math.max(MIN_TEXT_PX, designSize);
  return Math.max(MIN_TEXT_PX, designSize * scale);
}

/** Vertical padding and border of a label plate, in screen px. The component uses the same two numbers. */
export const LABEL_PAD_PX = 4;
export const LABEL_BORDER_PX = 2;
/** Line height of label text, as a multiple of its size. */
export const LABEL_LINE_HEIGHT = 1.2;

/** Height of the label's box: one line of text plus the padding and border of its plate. */
export function labelBoxHeight(px: number): number {
  return Math.ceil(px * LABEL_LINE_HEIGHT) + 2 * (LABEL_PAD_PX + LABEL_BORDER_PX);
}

/** The part's focus ring reaches this far (design units) outside its picture; a label stays clear of it. */
const FOCUS_RING_UNITS = 14;
const LABEL_GAP_PX = 4;

/** Space between a part's picture and its label: clear of the focus ring at this scale. */
export function labelGap(scale: number): number {
  return LABEL_GAP_PX + FOCUS_RING_UNITS * (scale > 0 ? scale : 1);
}

/**
 * Which side of the part its label goes on. Terminals are on the bottom row of the supply and the meters,
 * and wires hang below them, so those labels go above; the switch's name was already under its body.
 */
export function labelEdge(type: ComponentType): SlotEdge {
  return type === 'switch' ? 'below' : 'above';
}

const DESIGN_SIZE_OF: Readonly<Record<ComponentType, number>> = {
  ammeter: LABEL_DESIGN_SIZE.meter,
  voltmeter: LABEL_DESIGN_SIZE.meter,
  supply: LABEL_DESIGN_SIZE.supply,
  resistor: LABEL_DESIGN_SIZE.resistor,
  switch: LABEL_DESIGN_SIZE.switch,
};

/** Screen px a part's label takes above the part (its gap and its box); 0 when the label is not above. */
export function labelFootprint(type: ComponentType, scale: number): number {
  if (labelEdge(type) !== 'above') return 0;
  return labelGap(scale) + labelBoxHeight(labelPx(DESIGN_SIZE_OF[type], scale));
}
