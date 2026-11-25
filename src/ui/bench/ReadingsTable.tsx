import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { cn } from '../../components/ui';
import { FOCUS_RING } from '../../components/ui/styles';
import type { ReadingRow } from '../../bench/readings-table';
import { useElementSize } from './use-element-size';

const HEAD_CELL =
  'sticky top-0 z-10 border-b-2 border-wood-dark bg-mat py-1 text-left align-bottom font-body text-sm font-bold text-ink';
const CELL = 'border-b border-wood-light py-0.5 font-body text-base font-semibold text-ink';

export interface ReadingsTableProps {
  rows: ReadingRow[];
  showRatio: boolean;
  /** The id of the heading that names the table. */
  titleId: string;
  /** The short-window dock: tighter cells and a smaller gap above the table. */
  compact?: boolean;
}

/**
 * The readings as a real table: the header stays put while the body scrolls inside its own box, and the
 * newest row (the last) is kept in view. The box takes a Tab stop only when it really scrolls.
 */
export function ReadingsTable({ rows, showRatio, titleId, compact = false }: ReadingsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(scrollRef);
  const [scrolls, setScrolls] = useState(false);
  const pad = compact ? 'px-2' : 'px-3';

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (box === null) return;
    box.scrollTop = box.scrollHeight;
    setScrolls(box.scrollHeight > box.clientHeight);
  }, [rows.length, size]);

  return (
    <div
      ref={scrollRef}
      data-readings-scroll
      tabIndex={scrolls ? 0 : undefined}
      className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden', compact ? 'mt-1' : 'mt-2', FOCUS_RING)}
    >
      <table aria-labelledby={titleId} className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD_CELL, pad)}>
              {t('bench.colVoltage')}
            </th>
            <th scope="col" className={cn(HEAD_CELL, pad)}>
              {t('bench.colCurrent')}
            </th>
            {showRatio && (
              <th scope="col" className={cn(HEAD_CELL, pad)}>
                {t('bench.colRatio')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-reading-row>
              <td className={cn(CELL, pad)}>{row.voltage}</td>
              <td className={cn(CELL, pad)}>{row.current}</td>
              {showRatio && <td className={cn(CELL, pad)}>{row.ratio}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-3 py-2 font-body text-base text-ink">{t('bench.noReadings')}</p>}
    </div>
  );
}
