import { useLayoutEffect, useRef, type RefObject } from 'react';
import { isMeterType, meterView, NEEDLE_PIVOT, type MeterView } from '../../bench/meters';
import { useMotionReduced } from '../../components/ui';
import type { ComponentType } from '../../model/types';
import tokens from '../../spec/design-tokens.json';
import { selectLive, useBenchStore } from '../../state';

/**
 * The live view of an ammeter or voltmeter, and the needle turning to it. Undefined for any other part
 * (and before the bench is open). The needle swings about its hub in the `needle` duration with the
 * `easing` token; the first drawing, a reload and Reduce motion all set it with no transition at all.
 * Both meters read the same live solve, at the supply's real voltage.
 */
export function useMeter(type: ComponentType, art: RefObject<SVGGElement>): MeterView | undefined {
  const live = useBenchStore(selectLive);
  const experiment = useBenchStore((state) => state.session?.experiment);
  const reduced = useMotionReduced();
  const placed = useRef(false);
  const view = live !== undefined && experiment !== undefined && isMeterType(type) ? meterView(live, experiment, type) : undefined;
  const angle = view?.angle;

  useLayoutEffect(() => {
    if (angle === undefined) return;
    const node = art.current?.querySelector<SVGGElement>('[data-needle]');
    if (node === null || node === undefined) return;
    node.style.transformOrigin = NEEDLE_PIVOT;
    node.style.transition = placed.current && !reduced ? `transform ${tokens.motion.needle}ms ${tokens.motion.easing}` : 'none';
    node.style.transform = `rotate(${angle}deg)`;
    node.setAttribute('data-needle-angle', String(angle));
    placed.current = true;
  }, [art, angle, reduced]);

  return view;
}
