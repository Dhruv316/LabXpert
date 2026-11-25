import { calcDrawing, type CalcPair } from '../../bench/calc-cards';
import { t } from '../../i18n';
import { partMarkup } from './part-art';

/** The picture's accessible name: the pair worded as a sentence (practice.calcSeries or practice.calcParallel). */
export function calcName(pair: CalcPair): string {
  const params = { r1: pair.r1, r2: pair.r2 };
  return pair.topology === 'series' ? t('practice.calcSeries', params) : t('practice.calcParallel', params);
}

const WIRE_OUTLINE = 9;
const WIRE_FILL = 5;
const JOINT_RADIUS = 6;
const VALUE_SIZE = 16;

/**
 * Two resistors drawn from the real resistor art, end to end (series) or stacked and joined at both ends (parallel),
 * with straight wires in the bench's wire colours. Drawing units are screen pixels, so the 16 px values stay 16 px.
 */
export function CalcDrawing({ pair }: { pair: CalcPair }) {
  const drawing = calcDrawing(pair);
  return (
    <svg
      role="img"
      aria-label={calcName(pair)}
      data-drawing={drawing.topology}
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      width={drawing.width}
      height={drawing.height}
      focusable="false"
      className="shrink-0"
    >
      {drawing.wires.map(([from, to], index) => (
        <g key={index} strokeLinecap="round" className="fill-none">
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth={WIRE_OUTLINE} className="stroke-ink" />
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth={WIRE_FILL} className="stroke-teal" />
        </g>
      ))}
      {drawing.joints.map((joint, index) => (
        <circle key={index} cx={joint.x} cy={joint.y} r={JOINT_RADIUS} className="fill-ink" />
      ))}
      {drawing.resistors.map((resistor) => (
        <g key={resistor.index} data-calc-resistor={resistor.index}>
          <g
            transform={`translate(${resistor.x} ${resistor.y}) scale(${drawing.scale})`}
            dangerouslySetInnerHTML={{ __html: partMarkup({ type: 'resistor', ohms: resistor.ohms }).art }}
          />
          <text
            x={resistor.labelX}
            y={resistor.labelY}
            textAnchor="middle"
            fontSize={VALUE_SIZE}
            className="fill-ink font-heading font-semibold"
          >
            {t('bench.resistanceValue', { ohms: resistor.ohms })}
          </text>
        </g>
      ))}
    </svg>
  );
}
