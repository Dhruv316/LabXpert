import { t } from '../../i18n';
import type { ComponentType, ExperimentConfig } from '../../model/types';
import ammeterRaw from '../../assets/components/ammeter.svg?raw';
import resistorRaw from '../../assets/components/resistor.svg?raw';
import supplyRaw from '../../assets/components/supply.svg?raw';
import switchRaw from '../../assets/components/switch.svg?raw';
import voltmeterRaw from '../../assets/components/voltmeter.svg?raw';

const ART_HEIGHT = 48;

interface Art {
  viewBox: string;
  width: number;
  inner: string;
}

// The supply's own name (its one <text> without an id) is swapped for this mark and worded at draw time.
const NAME_MARK = '\u0001';
const NAME_TEXT = /(<text\b(?![^>]*\bid=)[^>]*>)([^<]*)(<\/text>)/;

/**
 * The kit SVGs are used as given, inline. Only the outer <svg>, the <title> (hard-coded English)
 * and the element ids are dropped: the card is decorative, and several copies on one page must
 * not repeat the same ids. With `named`, the picture's own name text is left for the current language.
 */
function toArt(raw: string, named = false): Art {
  const box = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 200 100';
  const [, , w, h] = box.split(/\s+/).map(Number);
  const source = named
    ? raw.replace(NAME_TEXT, (_all, open: string, _old: string, close: string) => `${open}${NAME_MARK}${close}`)
    : raw;
  return {
    viewBox: box,
    width: Math.round((ART_HEIGHT * w) / h),
    inner: source
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/\sid="[^"]*"/g, '')
      .trim(),
  };
}

const ART: Record<ComponentType, Art> = {
  supply: toArt(supplyRaw, true),
  switch: toArt(switchRaw),
  resistor: toArt(resistorRaw),
  ammeter: toArt(ammeterRaw),
  voltmeter: toArt(voltmeterRaw),
};

const ORDER: readonly ComponentType[] = ['supply', 'switch', 'resistor', 'ammeter', 'voltmeter'];

/** A strip of the real component drawings the experiment needs (read from its configuration). */
export function ExperimentArt({ experiment }: { experiment: ExperimentConfig }) {
  const types = ORDER.filter((type) => (experiment.requiredComponents[type] ?? 0) > 0);
  return (
    <div
      aria-hidden="true"
      className="flex h-20 items-center justify-center gap-4 rounded-control border-2 border-wood-light bg-cream px-4"
    >
      {types.map((type) => (
        <svg
          key={type}
          viewBox={ART[type].viewBox}
          width={ART[type].width}
          height={ART_HEIGHT}
          focusable="false"
          dangerouslySetInnerHTML={{ __html: ART[type].inner.replace(NAME_MARK, t('components.supply')) }}
        />
      ))}
    </div>
  );
}
