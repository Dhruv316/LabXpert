import { useId, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, X } from 'lucide-react';
import { shelfStatus, type ShelfStatus } from '../../bench/ops';
import { Icon, cn } from '../../components/ui';
import { DISABLED_LOOK, FOCUS_RING } from '../../components/ui/styles';
import { t } from '../../i18n';
import type { ComponentType, ExperimentConfig, ShelfItem } from '../../model/types';
import { useBenchStore } from '../../state';
import { PartArt } from './PartArt';
import { shelfLook } from './part-art';
import { useShelfDrag } from './use-shelf-drag';

const TILE_SCALE = 0.6; // "about 60%" (UI_SCREENS §3, Shelf)

export interface ShelfProps {
  experiment: ExperimentConfig;
  /** A tap or click, or Enter or Space, on a tile: the part goes to the next free spot. */
  onPlace: (type: ComponentType) => void;
  /** A tile released at this screen position. */
  onDrop: (type: ComponentType, clientX: number, clientY: number) => void;
}

interface TileProps {
  item: ShelfItem;
  status: ShelfStatus;
  experiment: ExperimentConfig;
  onPlace: ShelfProps['onPlace'];
  onPress: (type: ComponentType, event: ReactPointerEvent) => void;
  /** True when this click only ends a drag. */
  consumeDrag: () => boolean;
}

function ShelfTile({ item, status, experiment, onPlace, onPress, consumeDrag }: TileProps) {
  const look = shelfLook(item, experiment);
  return (
    <button
      type="button"
      disabled={status.full}
      data-shelf-type={item.type}
      onPointerDown={(event) => onPress(item.type, event)}
      onClick={() => {
        if (!consumeDrag()) onPlace(item.type);
      }}
      onKeyDown={(event) => {
        // Enter (and Space) place the part; the default is stopped so the browser's own click does not place a second one.
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!event.repeat) onPlace(item.type);
      }}
      onKeyUp={(event) => {
        // Space clicks on key release in some browsers.
        if (event.key === ' ') event.preventDefault();
      }}
      className={cn(
        'relative flex w-full touch-none select-none flex-col items-center gap-1 rounded-card border-2 p-3',
        'font-body font-bold text-ink transition-[transform,box-shadow] duration-fast ease-bouncy',
        FOCUS_RING,
        status.full
          ? 'cursor-not-allowed border-wood-light bg-cream'
          : 'cursor-grab border-wood-light bg-mat shadow-lift hover:-translate-y-px active:translate-y-0.5 active:shadow-press',
      )}
    >
      <span className={cn('flex flex-col items-center gap-1', status.full && DISABLED_LOOK)}>
        <PartArt look={look} scale={TILE_SCALE} />
        <span className="font-heading font-medium first-letter:uppercase">{t(`components.${item.type}`)}</span>
      </span>
      {/* The × is an icon so no text literal sits in the markup; the number is the shelf's `max`. */}
      <span
        data-testid={`shelf-max-${item.type}`}
        className="absolute right-2 top-2 inline-flex items-center rounded-small bg-cream px-1.5 text-sm font-bold text-ink-soft"
      >
        <Icon icon={X} size={14} />
        {item.max}
      </span>
      {status.full && (
        <span className="inline-flex items-center gap-1 text-sm text-ok">
          <Icon icon={Check} size={16} />
          {t('bench.shelfFull')}
        </span>
      )}
    </button>
  );
}

/** The parts shelf (UI_SCREENS §3): one tile per allowed part, drag to place, or tap or press Enter for the next free spot. */
export function Shelf({ experiment, onPlace, onDrop }: ShelfProps) {
  const titleId = useId();
  const circuit = useBenchStore((state) => state.circuit);
  const { ghost, begin, consumeDrag } = useShelfDrag(onDrop);
  const statuses = shelfStatus(circuit, experiment);
  const ghostItem = experiment.shelf.find((item) => item.type === ghost?.type);

  return (
    <aside
      aria-labelledby={titleId}
      className="flex w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r-4 border-wood-light bg-cream p-3"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-heading text-xl font-semibold leading-7">
          {t('bench.shelfTitle')}
        </h2>
        <p className="text-sm font-semibold text-ink-soft">{t('bench.shelfHint')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {experiment.shelf.map((item, index) => {
          const status = statuses[index];
          if (status === undefined) return null;
          return (
            <li key={item.type}>
              <ShelfTile item={item} status={status} experiment={experiment} onPlace={onPlace} onPress={begin} consumeDrag={consumeDrag} />
            </li>
          );
        })}
      </ul>
      {ghost !== undefined && ghostItem !== undefined && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 drop-shadow-component"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, -50%)' }}
        >
          <PartArt look={shelfLook(ghostItem, experiment)} scale={TILE_SCALE} />
        </div>
      )}
    </aside>
  );
}
