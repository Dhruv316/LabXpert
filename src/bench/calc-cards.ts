// Pure helpers for the calculation practice cards: where the two resistors and their wires go, and which typed
// text belongs to a card that was answered earlier. No React, no clock, no student-facing text.
import { expectedEquivalentResistance } from '../engine/answer';
import type { AnswerSubmission, PracticeTask } from '../model/types';

/** One entry of a calculation task's `calcPairs`. */
export type CalcPair = NonNullable<PracticeTask['calcPairs']>[number];

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawnResistor {
  /** 0 for R1, 1 for R2. */
  index: 0 | 1;
  ohms: number;
  /** Top-left corner of the resistor picture, in drawing units. */
  x: number;
  y: number;
  /** Where its value is written: centred under the body. */
  labelX: number;
  labelY: number;
}

export interface CalcDrawing {
  topology: CalcPair['topology'];
  /** Drawing units equal screen pixels, so text of 16 stays 16 px. */
  width: number;
  height: number;
  /** The kit resistor SVG is 200 × 90; it is drawn at this scale. */
  scale: number;
  resistors: DrawnResistor[];
  /** Straight wire pieces, each from one point to another. */
  wires: [DrawingPoint, DrawingPoint][];
  /** Dots where wires meet (the two ends of a parallel pair). */
  joints: DrawingPoint[];
}

/** The kit resistor picture (assets/components/resistor.svg): its size, terminal height and where the body ends. */
const ART = { width: 200, height: 90, terminalY: 38, terminalAX: 12, terminalBX: 188, bodyBottom: 64 } as const;
const SCALE = 0.8;
const PAD = 12;
const LEAD = 32;
/** Series: the wire between the two resistors. Parallel: the gap between a bus and the resistor's terminal. */
const JOIN = 40;
const LABEL_DROP = 22;
const ROW_GAP = 28;

const box = { width: ART.width * SCALE, terminalY: ART.terminalY * SCALE, a: ART.terminalAX * SCALE, b: ART.terminalBX * SCALE };
const labelOffset = ART.bodyBottom * SCALE + LABEL_DROP;

function place(index: 0 | 1, ohms: number, x: number, y: number): DrawnResistor {
  return { index, ohms, x, y, labelX: x + box.width / 2, labelY: y + labelOffset };
}

function seriesDrawing(r1: number, r2: number): CalcDrawing {
  const y = PAD;
  const termY = y + box.terminalY;
  const x1 = PAD + LEAD;
  const x2 = x1 + box.width + JOIN;
  const end = x2 + box.width + LEAD;
  return {
    topology: 'series',
    width: end + PAD,
    height: Math.ceil(y + labelOffset + PAD),
    scale: SCALE,
    resistors: [place(0, r1, x1, y), place(1, r2, x2, y)],
    wires: [
      [{ x: PAD, y: termY }, { x: x1 + box.a, y: termY }],
      [{ x: x1 + box.b, y: termY }, { x: x2 + box.a, y: termY }],
      [{ x: x2 + box.b, y: termY }, { x: end, y: termY }],
    ],
    joints: [],
  };
}

function parallelDrawing(r1: number, r2: number): CalcDrawing {
  const rowPitch = labelOffset + ROW_GAP;
  const y1 = PAD;
  const y2 = y1 + rowPitch;
  const termY1 = y1 + box.terminalY;
  const termY2 = y2 + box.terminalY;
  const midY = (termY1 + termY2) / 2;
  const busLeft = PAD + LEAD;
  const x = busLeft + JOIN;
  const a = x + box.a;
  const b = x + box.b;
  // The right bus mirrors the left one: the same distance from the resistor's terminal.
  const busRight = b + (a - busLeft);
  const end = busRight + LEAD;
  return {
    topology: 'parallel',
    width: end + PAD,
    height: Math.ceil(y2 + labelOffset + PAD),
    scale: SCALE,
    resistors: [place(0, r1, x, y1), place(1, r2, x, y2)],
    wires: [
      [{ x: PAD, y: midY }, { x: busLeft, y: midY }],
      [{ x: busLeft, y: termY1 }, { x: busLeft, y: termY2 }],
      [{ x: busLeft, y: termY1 }, { x: a, y: termY1 }],
      [{ x: busLeft, y: termY2 }, { x: a, y: termY2 }],
      [{ x: b, y: termY1 }, { x: busRight, y: termY1 }],
      [{ x: b, y: termY2 }, { x: busRight, y: termY2 }],
      [{ x: busRight, y: termY1 }, { x: busRight, y: termY2 }],
      [{ x: busRight, y: midY }, { x: end, y: midY }],
    ],
    joints: [
      { x: busLeft, y: midY },
      { x: busRight, y: midY },
    ],
  };
}

/** How a pair is drawn: end to end for series, stacked and joined at both ends for parallel. */
export function calcDrawing(pair: Pick<CalcPair, 'topology' | 'r1' | 'r2'>): CalcDrawing {
  return pair.topology === 'series' ? seriesDrawing(pair.r1, pair.r2) : parallelDrawing(pair.r1, pair.r2);
}

/**
 * The text to show in the field of a card that was answered correctly before this screen was opened (a reload).
 * An `AnswerSubmission` does not say which pair it was for, so the correct answer whose formula value matches the
 * pair's is used; two pairs with the same value would show equally correct text. Empty when none matches.
 */
export function answeredText(pair: CalcPair, answers: readonly AnswerSubmission[]): string {
  const expected = expectedEquivalentResistance(pair.topology, pair.r1, pair.r2);
  const match = [...answers]
    .reverse()
    .find((answer) => answer.correct && Math.abs(answer.expected - expected) <= 1e-9 * Math.max(1, Math.abs(expected)));
  return match === undefined ? '' : String(match.typed);
}
