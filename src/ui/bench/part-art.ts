import ammeterRaw from '../../assets/components/ammeter.svg?raw';
import resistorRaw from '../../assets/components/resistor.svg?raw';
import supplyRaw from '../../assets/components/supply.svg?raw';
import switchRaw from '../../assets/components/switch.svg?raw';
import voltmeterRaw from '../../assets/components/voltmeter.svg?raw';
import { resistorBands } from '../../bench/catalog';
import { bladeAngle, knobAngle, OVERLOAD_LIGHT_ON } from '../../bench/live';
import { t } from '../../i18n';
import type { CircuitComponent, ComponentType, ExperimentConfig, ShelfItem } from '../../model/types';

const RAW: Record<ComponentType, string> = {
  supply: supplyRaw,
  switch: switchRaw,
  resistor: resistorRaw,
  ammeter: ammeterRaw,
  voltmeter: voltmeterRaw,
};

/** What changes the picture of a part. Everything else in the kit SVG is used exactly as given. */
export type PartLook =
  | { type: 'supply'; voltage: number; min: number; max: number; overload: boolean }
  | { type: 'resistor'; ohms: number }
  | { type: 'switch'; closed: boolean }
  | { type: 'ammeter' }
  | { type: 'voltmeter' };

export function lookOf(part: CircuitComponent, supply: ExperimentConfig['supply'], overload: boolean): PartLook {
  switch (part.type) {
    case 'supply':
      return { type: 'supply', voltage: part.voltage, min: supply.min, max: supply.max, overload };
    case 'resistor':
      return { type: 'resistor', ohms: part.ohms };
    case 'switch':
      return { type: 'switch', closed: part.closed };
    case 'ammeter':
      return { type: 'ammeter' };
    case 'voltmeter':
      return { type: 'voltmeter' };
  }
}

function withFill(svg: string, elementId: string, colour: string): string {
  return svg.replace(new RegExp(`(id="${elementId}"[^>]*?fill=")[^"]*(")`), `$1${colour}$2`);
}

/** Replaces the whole text of an element: the supply's display is worded by bench.supplyValue, not patched. */
function withText(svg: string, elementId: string, text: string): string {
  const pattern = new RegExp(`(id="${elementId}"[^>]*>)([^<]*)(<)`);
  return svg.replace(pattern, (_all, open: string, _old: string, close: string) => `${open}${text}${close}`);
}

/** The supply's name drawn on the kit picture (its text element without an id): worded by components.supply, not the kit's English. */
const SUPPLY_NAME_TEXT = /(<text\b(?![^>]*\bid=)[^>]*>)([^<]*)(<\/text>)/;

function applyLook(raw: string, look: PartLook): string {
  switch (look.type) {
    case 'resistor': {
      const bands = resistorBands(look.ohms);
      let svg = withText(raw, 'value-text', t('bench.resistanceValue', { ohms: look.ohms }));
      bands?.forEach((colour, index) => {
        svg = withFill(svg, `band-${index + 1}`, colour);
      });
      return svg;
    }
    case 'supply': {
      const angle = knobAngle(look.voltage, look.min, look.max);
      const shown = withText(raw, 'display-text', t('bench.supplyValue', { volts: look.voltage }))
        .replace(SUPPLY_NAME_TEXT, (_all, open: string, _old: string, close: string) => `${open}${t('components.supply')}${close}`)
        .replace(
        /(id="knob-indicator" transform="rotate\()[^ ]+( )/,
        `$1${angle}$2`,
      );
      // The light is lit by an attribute change only: nothing about it animates, so Reduce motion needs no special case.
      const colour = look.overload ? OVERLOAD_LIGHT_ON : undefined;
      // data-overload-light survives the id clean-up below, so the light can be found (and tested) without its id.
      const marked = shown.replace('id="overload-light"', `id="overload-light" data-overload-light="${colour !== undefined}"`);
      return colour === undefined ? marked : withFill(marked, 'overload-light', colour);
    }
    case 'switch':
      // data-blade survives the id clean-up below: the bench animates the blade through it (BenchPart).
      return raw.replace(
        /id="blade" transform="rotate\([^ ]+ /,
        `id="blade" data-blade="true" transform="rotate(${bladeAngle(look.closed)} `,
      );
    case 'ammeter':
    case 'voltmeter':
      // data-needle survives the id clean-up below: the bench turns the needle through it (BenchPart).
      return raw.replace(/id="needle" transform=/, 'id="needle" data-needle="true" transform=');
  }
}

export interface PartMarkup {
  viewBox: string;
  /** The SVG's inside, with ids and the English <title> removed (several copies share a page). */
  inner: string;
  /** `inner` without its text: the body of the part, drawn under the wires. */
  art: string;
  /** The text left on the picture (the supply's name, a meter's letter), exactly as the kit draws it: drawn over the wires. The value texts are not here (see CHIP_TEXT). */
  labels: string;
}

const cache = new Map<string, PartMarkup>();

const LABEL_TEXT = /<text\b[^>]*>[\s\S]*?<\/text>/g;

function splitLabels(svg: string): { art: string; labels: string } {
  const labels: string[] = [];
  const take = (match: string): string => {
    labels.push(match);
    return '';
  };
  const art = svg.replace(LABEL_TEXT, take);
  return { art, labels: labels.join('') };
}

// The texts that carry a value (resistor value, supply display, the switch's name) are drawn by the bench's
// HTML label layer so they can stay 14 px on screen; the bench picture leaves them out. The shelf keeps them.
const CHIP_TEXT = /<text\b[^>]*\bid="(?:value-text|display-text)"[^>]*>[\s\S]*?<\/text>|<text\b[^>]*>Switch<\/text>/g;

const stripIds = (svg: string): string => svg.replace(/\sid="[^"]*"/g, '').trim();

/**
 * The kit SVGs, inline and as given. Only the outer <svg>, the hard-coded English <title> and the
 * ids are dropped; `data-terminal` stays so the wiring part can find each post.
 */
export function partMarkup(look: PartLook): PartMarkup {
  const key = JSON.stringify(look);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const raw = RAW[look.type];
  const body = applyLook(raw, look)
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '');
  const split = splitLabels(body.replace(CHIP_TEXT, ''));
  const result: PartMarkup = {
    viewBox: /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 200 100',
    inner: stripIds(body),
    art: stripIds(split.art),
    labels: stripIds(split.labels),
  };
  cache.set(key, result);
  return result;
}

/** A shelf tile shows the part as it would first land on the bench. */
export function shelfLook(item: ShelfItem, experiment: ExperimentConfig): PartLook {
  switch (item.type) {
    case 'supply':
      return {
        type: 'supply',
        voltage: experiment.supply.default,
        min: experiment.supply.min,
        max: experiment.supply.max,
        overload: false,
      };
    case 'resistor': {
      const configured = item.defaultOhms;
      const ohms =
        typeof configured === 'number'
          ? configured
          : (Object.values(configured ?? {})[0] ?? experiment.resistorValues[0] ?? 0);
      return { type: 'resistor', ohms };
    }
    case 'switch':
      return { type: 'switch', closed: false };
    case 'ammeter':
      return { type: 'ammeter' };
    case 'voltmeter':
      return { type: 'voltmeter' };
  }
}
