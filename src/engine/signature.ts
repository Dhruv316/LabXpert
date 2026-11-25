import type { Circuit, CircuitComponent, Wire } from '../model/types';

// Plain code-unit comparison, not localeCompare: the result must not depend on the machine's locale.
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function wirePart(wire: Wire): string {
  return [wire.from, wire.to].sort(byCodeUnit).join('~');
}

// Only the value that matters electrically; meters have none. `role` is a label, not a value (rules-spec §F).
function componentValue(component: CircuitComponent): string {
  switch (component.type) {
    case 'resistor':
      return String(component.ohms);
    case 'supply':
      return String(component.voltage);
    case 'switch':
      return String(component.closed);
    case 'ammeter':
    case 'voltmeter':
      return '';
  }
}

function componentPart(component: CircuitComponent): string {
  return `${component.id},${component.type},${componentValue(component)}`;
}

/** rules-spec §F: sorted wires, then components by id with type and value. Positions are excluded. */
export function circuitSignature(circuit: Circuit): string {
  const wires = circuit.wires.map(wirePart).sort(byCodeUnit);
  const components = [...circuit.components]
    .sort((a, b) => byCodeUnit(a.id, b.id))
    .map(componentPart);
  return `wires:${wires.join(';')}|components:${components.join(';')}`;
}

/** rules-spec §F, for MISSING_READING, MISSING_ANSWER and EQUIVALENT_R_WRONG. `typed` is empty when nothing was typed. */
export function actionSignature(readingCount: number, answerCount: number, typed?: number): string {
  return `readings:${readingCount}|answers:${answerCount}|typed:${typed === undefined ? '' : String(typed)}`;
}
