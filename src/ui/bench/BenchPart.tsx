import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { PART_SIZE } from '../../bench/catalog';
import type { Point } from '../../bench/geometry';
import { bladeAngle } from '../../bench/live';
import { isMeterType } from '../../bench/meters';
import type { StepDirection } from '../../bench/supply';
import { cn, useMotionReduced } from '../../components/ui';
import { t } from '../../i18n';
import type { CircuitComponent } from '../../model/types';
import tokens from '../../spec/design-tokens.json';
import { useBenchStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { MeterDescription } from './MeterReadout';
import { partMarkup, type PartLook } from './part-art';
import { focusResistorControl } from './ResistorControl';
import { useSupplyStep, useSwitchToggle } from './use-live-controls';
import { useMeter } from './use-meter';

const NUDGE = 12; // design units per arrow press; Shift moves four times as far
const NUDGE_BIG = 48;
const SELECT_PAD = 8;
const FOCUS_PAD = 14;
/** A press on the switch that moves less than this many screen px is a click; more is a drag (it never toggles). */
const CLICK_SLOP_PX = 6;
/** components.json › switch › blade: it turns about the left post. */
const BLADE_PIVOT = '30px 70px';
/** The blade's angle is set by the layout effect below, so the picture itself never changes with the switch. */
const SWITCH_PICTURE: PartLook = { type: 'switch', closed: false };

const VOLTAGE_KEYS: Readonly<Record<string, StepDirection | undefined>> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
};

export interface BenchPartProps {
  part: CircuitComponent;
  look: PartLook;
  selected: boolean;
  dragging: boolean;
  /** Screen position to mat position, or undefined before layout. */
  toBench: (clientX: number, clientY: number) => Point | undefined;
  /** The bench's label layer, above the wires: the text left on the part's picture is drawn there. Null before it exists. */
  labelHost: SVGGElement | null;
  onRemove: (id: string) => void;
  /** The tutor flags this part (its outline and badge are drawn in the highlight layer). */
  flagged?: boolean;
  /** The hidden element holding the primary error's title, set as this part's description while it is flagged. */
  flagDescriptionId?: string;
}

interface DragStart {
  pointerId: number;
  dx: number;
  dy: number;
}

/** A press on a switch, followed until it is known to be a click or a drag. */
interface SwitchPress {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}


/**
 * One placed part: the real SVG with a shadow, plus select, drag, arrow-key move and Delete.
 * A switch is also a switch: a click or Enter or Space toggles it. A supply takes the arrow keys
 * for its voltage, so it moves with Shift and an arrow.
 */
export function BenchPart({ part, look, selected, dragging, toBench, labelHost, onRemove, flagged = false, flagDescriptionId }: BenchPartProps) {
  const size = PART_SIZE[part.type];
  const isSwitch = part.type === 'switch';
  const closed = part.type === 'switch' && part.closed;
  const markup = partMarkup(isSwitch ? SWITCH_PICTURE : look);
  const locked = part.locked === true;
  const drag = useRef<DragStart | undefined>(undefined);
  const press = useRef<SwitchPress | undefined>(undefined);
  const art = useRef<SVGGElement>(null);
  const blade = useRef<{ placed: boolean }>({ placed: false });
  const reduced = useMotionReduced();
  const crash = useCrash();
  const toggleSwitch = useSwitchToggle();
  const stepSupply = useSupplyStep();
  const meter = useMeter(part.type, art);
  const descriptionId = useId();
  // The labels live in another layer, so the hover lift that CSS gives the body is repeated for them from this flag.
  const [hovered, setHovered] = useState(false);

  // The blade turns about the left post in the base duration with the easing token (CSS does the
  // animation). The first placement is not animated, and neither is any change under reduced motion.
  useLayoutEffect(() => {
    if (!isSwitch) return;
    const node = art.current?.querySelector<SVGGElement>('[data-blade]');
    if (node === null || node === undefined) return;
    const angle = bladeAngle(closed);
    node.style.transformOrigin = BLADE_PIVOT;
    node.style.transition = blade.current.placed && !reduced ? `transform ${tokens.motion.base}ms ${tokens.motion.easing}` : 'none';
    node.style.transform = `rotate(${angle}deg)`;
    node.setAttribute('data-blade-angle', String(angle));
    blade.current.placed = true;
  }, [isSwitch, closed, reduced]);

  const onPointerDown = (event: PointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    // Stops the mat's "click empty space deselects" from firing for a click on a part.
    event.stopPropagation();
    const store = useBenchStore.getState();
    store.startDrag(part.id);
    const point = toBench(event.clientX, event.clientY);
    if (isSwitch) press.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    if (point === undefined) return;
    if (!locked) drag.current = { pointerId: event.pointerId, dx: point.x - part.x, dy: point.y - part.y };
    // A locked switch still needs its pointer-up, so it is captured too; other locked parts never were.
    if (!locked || isSwitch) event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<SVGGElement>) => {
    // A switch stays put until the press has clearly become a drag, so a click with a shaky hand still
    // toggles. Followed even when the part cannot move (locked), so such a drag never toggles either.
    const pending = press.current;
    if (pending !== undefined && pending.pointerId === event.pointerId && !pending.moved) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < CLICK_SLOP_PX) return;
      pending.moved = true;
    }
    const start = drag.current;
    if (start === undefined || start.pointerId !== event.pointerId) return;
    const point = toBench(event.clientX, event.clientY);
    if (point !== undefined) useBenchStore.getState().dragTo(part.id, point.x - start.dx, point.y - start.dy);
  };

  const onPointerEnd = (event: PointerEvent<SVGGElement>) => {
    const pending = press.current;
    press.current = undefined;
    const wasDragging = drag.current !== undefined;
    drag.current = undefined;
    if (wasDragging) useBenchStore.getState().endDrag().catch(crash);
    // A switch the pointer never left (and that was not cancelled) is a click. It works on a locked switch too:
    // locked parts cannot be moved or removed, but a locked circuit can still be switched on.
    if (pending !== undefined && !pending.moved && event.type === 'pointerup' && pending.pointerId === event.pointerId) {
      toggleSwitch(part.id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    const store = useBenchStore.getState();
    const direction = VOLTAGE_KEYS[event.key];
    if (part.type === 'supply' && direction !== undefined && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      stepSupply(part.id, direction);
      return;
    }
    const step = event.shiftKey && part.type !== 'supply' ? NUDGE_BIG : NUDGE;
    const moves: Record<string, readonly [number, number] | undefined> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      if (!selected) store.select(part.id);
      store.nudge(part.id, move[0], move[1]).catch(crash);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(part.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isSwitch) {
        if (!event.repeat) toggleSwitch(part.id);
      } else {
        store.select(part.id);
        if (part.type === 'resistor' && !event.repeat) focusResistorControl(part.id);
      }
    } else if (event.key === 'Escape') {
      store.select(undefined);
    }
  };

  // A switch is named by its state, so a screen reader hears "Switch open" and the checked state together.
  const name =
    part.type === 'switch'
      ? t(part.closed ? 'bench.switchClosed' : 'bench.switchOpen')
      : part.type === 'resistor'
        ? [t('components.resistor'), part.role].join(' ')
        : t(`components.${part.type}`);

  // A meter's reading and the tutor's reason can both describe the same part.
  const describedBy =
    [meter === undefined ? undefined : descriptionId, flagged ? flagDescriptionId : undefined]
      .filter((id): id is string => id !== undefined)
      .join(' ') || undefined;

  return (
    <g
      transform={`translate(${part.x} ${part.y})`}
      role={isSwitch ? 'switch' : 'button'}
      tabIndex={0}
      aria-label={name}
      aria-pressed={isSwitch ? undefined : selected}
      aria-checked={part.type === 'switch' ? part.closed : undefined}
      aria-describedby={describedBy}
      data-part-id={part.id}
      data-selected={selected}
      data-flagged={flagged}
      className={cn('group outline-none', locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={onKeyDown}
    >
      <g
        ref={art}
        className={cn(
          'transition-transform duration-fast ease-bouncy',
          dragging ? '-translate-y-1 rotate-[4deg]' : 'group-hover:-translate-y-0.5',
        )}
        style={{ transformOrigin: `${size.width / 2}px ${size.height / 2}px` }}
      >
        <rect width={size.width} height={size.height} className="fill-transparent" />
        <g filter={`url(#${dragging ? 'bench-shadow-lift' : 'bench-shadow'})`} dangerouslySetInnerHTML={{ __html: markup.art }} />
        {meter !== undefined && isMeterType(part.type) && <MeterDescription type={part.type} view={meter} descriptionId={descriptionId} />}
      </g>
      {/* Selected: dashed teal outline. Focus: a separate solid ring further out, so the two read apart. */}
      {selected && (
        <rect
          aria-hidden="true"
          x={-SELECT_PAD}
          y={-SELECT_PAD}
          width={size.width + SELECT_PAD * 2}
          height={size.height + SELECT_PAD * 2}
          rx={14}
          strokeWidth={3}
          strokeDasharray="10 7"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none fill-none stroke-teal"
        />
      )}
      <rect
        aria-hidden="true"
        x={-FOCUS_PAD}
        y={-FOCUS_PAD}
        width={size.width + FOCUS_PAD * 2}
        height={size.height + FOCUS_PAD * 2}
        rx={18}
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        className="pointer-events-none fill-none stroke-teal opacity-0 group-focus-visible:opacity-100"
      />
      {locked && (
        <g aria-hidden="true">
          <circle cx={14} cy={size.height - 14} r={13} className="fill-ink" />
          <Lock x={6} y={size.height - 22} size={16} className="stroke-cream" />
        </g>
      )}
      {/* The text left on the picture goes to the label layer (over the wires, under the terminals), moving with the part.
          Values (meter digits, resistor value and name, supply display, the switch's name) are in PartLabelLayer. */}
      {labelHost !== null &&
        createPortal(
          <g data-part-labels={part.id} aria-hidden="true" transform={`translate(${part.x} ${part.y})`}>
            <g
              className={cn('transition-transform duration-fast ease-bouncy', dragging ? '-translate-y-1 rotate-[4deg]' : hovered && '-translate-y-0.5')}
              style={{ transformOrigin: `${size.width / 2}px ${size.height / 2}px` }}
            >
              <g dangerouslySetInnerHTML={{ __html: markup.labels }} />
            </g>
          </g>,
          labelHost,
        )}
    </g>
  );
}
