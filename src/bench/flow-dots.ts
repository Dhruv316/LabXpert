// Which wires get flow dots, and which way the dots run along each. Pure: no React, no clock, no text.
// The decision is read from `wireFlow` (flow.ts); nothing about the circuit is solved again here.
import tokens from '../spec/design-tokens.json';
import type { Circuit } from '../model/types';
import type { WireFlow } from './flow';

/** Speed of the dots along a wire, in design units per second (design-tokens › motion.flowDotsPxPerSec). */
export const FLOW_DOTS_SPEED: number = tokens.motion.flowDotsPxPerSec;

/**
 * Distance between neighbouring dots, and the width of one dot. The kit gives a speed but no size, so these two
 * are chosen to sit inside the 5-unit teal fill (tokens › wire.fillWidth): the dot is a little wider than the
 * fill and its ink ring blends into the 9-unit ink outline, which keeps it readable on teal and on orange.
 */
export const FLOW_DOT_SPACING = 16;
export const FLOW_DOT_SIZE = 4;
export const FLOW_DOT_RING = 1;

/** Seconds for the dot pattern to move one spacing: the loop of the animation, so the dots never jump. */
export const FLOW_DOTS_LOOP_SECONDS: number = FLOW_DOT_SPACING / FLOW_DOTS_SPEED;

/**
 * `forward` when current enters at the wire's `from` end, so it runs the way the wire's path is drawn;
 * `reverse` when it enters at the `to` end.
 */
export type FlowDirection = 'forward' | 'reverse';

export interface FlowDots {
  wireId: string;
  direction: FlowDirection;
}

/** The wires that carry flow dots, in circuit order. A wire that is still, or has no matching end, gets none. */
export function flowDotsFor(circuit: Circuit, flow: WireFlow): FlowDots[] {
  return circuit.wires.flatMap((wire): FlowDots[] => {
    const current = flow.get(wire.id);
    if (current === undefined || !current.flowing) return [];
    if (current.from === wire.from) return [{ wireId: wire.id, direction: 'forward' }];
    if (current.from === wire.to) return [{ wireId: wire.id, direction: 'reverse' }];
    return [];
  });
}
