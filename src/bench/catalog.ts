import componentsSpec from '../spec/components.json';
import tokens from '../spec/design-tokens.json';
import type { ComponentType, ResistorComponent } from '../model/types';

/** Design units of the bench mat (components.json › bench). The SVG is scaled with viewBox, never resized. */
export const BENCH = {
  width: componentsSpec.bench.width,
  height: componentsSpec.bench.height,
} as const;

/** The drawn scene: the mat plus the table strip under it (DESIGN.md §5). Parts live in mat coordinates. */
export const BENCH_VIEW = {
  width: componentsSpec.bench.width,
  height: componentsSpec.bench.height + tokens.bench.tableStripHeight,
  tableStrip: tokens.bench.tableStripHeight,
  frame: tokens.bench.frameWidth,
  dotSpacing: tokens.bench.matDotSpacing,
  dotOpacity: tokens.bench.matDotOpacity,
} as const;

export interface PartSize {
  width: number;
  height: number;
}

export const PART_SIZE: Readonly<Record<ComponentType, PartSize>> = {
  supply: { width: componentsSpec.components.supply.width, height: componentsSpec.components.supply.height },
  resistor: { width: componentsSpec.components.resistor.width, height: componentsSpec.components.resistor.height },
  ammeter: { width: componentsSpec.components.ammeter.width, height: componentsSpec.components.ammeter.height },
  voltmeter: { width: componentsSpec.components.voltmeter.width, height: componentsSpec.components.voltmeter.height },
  switch: { width: componentsSpec.components.switch.width, height: componentsSpec.components.switch.height },
};

// colourCode also holds a `note` string next to the band lists, hence the union.
const COLOUR_CODE: Readonly<Record<string, readonly string[] | string>> =
  componentsSpec.components.resistor.colourCode;

/** [band-1, band-2, band-3] for a resistance (components.json › resistor › colourCode), if the spec has it. */
export function resistorBands(ohms: number): readonly string[] | undefined {
  const entry = COLOUR_CODE[String(ohms)];
  return typeof entry === 'string' ? undefined : entry;
}

export type ResistorRole = ResistorComponent['role'];

export function isResistorRole(value: string): value is ResistorRole {
  return value === 'R' || value === 'R1' || value === 'R2';
}

/** Prefix for a part's id. A resistor's id is its role instead (R, R1, R2), as in the spec test cases. */
export const ID_PREFIX: Readonly<Record<Exclude<ComponentType, 'resistor'>, string>> = {
  supply: 'S',
  switch: 'SW',
  ammeter: 'A',
  voltmeter: 'V',
};
