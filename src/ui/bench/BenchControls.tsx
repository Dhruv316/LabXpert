import type { ExperimentConfig } from '../../model/types';
import { useBenchStore } from '../../state';
import { CONTROL_GAP_PX, CONTROL_MIN_PX } from '../../bench/overlay';
import { ControlOverlay, type OverlaySlot } from './ControlOverlay';
import { ResistorControl } from './ResistorControl';
import { SupplyStepper } from './SupplyStepper';

/** The stepper's two 44 px buttons and the gap between them (gap-2 in SupplyStepper), for keeping it clear of wires. */
const STEPPER_BOX = { width: CONTROL_MIN_PX * 2 + CONTROL_GAP_PX, height: CONTROL_MIN_PX } as const;

/**
 * The on-screen controls that belong to parts: the stepper under each supply, and the value control
 * of the selected resistor. All go through the same overlay layer and placement.
 */
export function BenchControls({ experiment }: { experiment: ExperimentConfig }) {
  const circuit = useBenchStore((state) => state.circuit);
  const selectedId = useBenchStore((state) => state.selectedId);
  const slots: OverlaySlot[] = [];
  for (const part of circuit.components) {
    if (part.type === 'supply') {
      slots.push({
        key: `supply:${part.id}`,
        partId: part.id,
        edge: 'below',
        keepClear: STEPPER_BOX,
        children: <SupplyStepper part={part} supply={experiment.supply} />,
      });
    } else if (part.type === 'resistor' && part.id === selectedId) {
      slots.push({
        key: `resistor:${part.id}`,
        partId: part.id,
        edge: 'below',
        children: <ResistorControl part={part} values={experiment.resistorValues} />,
      });
    }
  }
  return <ControlOverlay slots={slots} />;
}
