// The order parts are put in the page, which is the order Tab visits them (DESIGN.md §11: bench parts,
// then the switch, then the supply stepper). Pure, so the rule is testable without a browser.
import type { CircuitComponent } from '../model/types';

/**
 * Parts in placement order with every switch moved to the end. The stepper and value controls come after the
 * bench in the page, so this gives "parts, switch, supply stepper". A switch drawn last also lies on top of
 * its neighbours, which matters only if two parts overlap.
 */
export function partsInTabOrder(components: readonly CircuitComponent[]): CircuitComponent[] {
  return [...components.filter((part) => part.type !== 'switch'), ...components.filter((part) => part.type === 'switch')];
}
