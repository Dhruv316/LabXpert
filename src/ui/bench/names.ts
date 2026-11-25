// Accessible names for parts, terminals and wires. All words come from t(); this file only picks keys.
import { findComponent } from '../../bench/ops';
import { parseTerminalRef } from '../../bench/wires';
import { t } from '../../i18n';
import type { Circuit, CircuitComponent, TerminalName, TerminalRef, Wire } from '../../model/types';

const TERMINAL_WORD = {
  pos: 'bench.terminalPos',
  neg: 'bench.terminalNeg',
  a: 'bench.terminalA',
  b: 'bench.terminalB',
} as const;

/** "Ammeter", or "Resistor R1" for a resistor, which is told apart by its role. */
export function partName(part: CircuitComponent): string {
  return part.type === 'resistor' ? [t('components.resistor'), part.role].join(' ') : t(`components.${part.type}`);
}

/** "Ammeter, positive terminal" (bench.terminalLabel). */
export function terminalName(part: CircuitComponent, name: TerminalName): string {
  return t('bench.terminalLabel', { part: partName(part), terminal: t(TERMINAL_WORD[name]) });
}

/** The name of the terminal a ref points at, or undefined when its part is not on the bench. */
export function terminalRefName(circuit: Circuit, ref: TerminalRef): string | undefined {
  const { componentId, name } = parseTerminalRef(ref);
  const part = findComponent(circuit, componentId);
  return part === undefined ? undefined : terminalName(part, name);
}

/** "Wire from Resistor R1, left terminal to Ammeter, positive terminal" (bench.wireLabel). */
export function wireName(circuit: Circuit, wire: Wire): string | undefined {
  const from = terminalRefName(circuit, wire.from);
  const to = terminalRefName(circuit, wire.to);
  return from === undefined || to === undefined ? undefined : t('bench.wireLabel', { from, to });
}
