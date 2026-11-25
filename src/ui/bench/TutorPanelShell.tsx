import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Ollie } from '../../components/Ollie';
import { IconButton, Tooltip, cn } from '../../components/ui';
import { t } from '../../i18n';

export interface TutorPanelShellProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Visual shell of Ollie's panel: 360 px, collapsing to a 56 px strip (DESIGN.md §8). It only has
 * a title for now; the tips arrive in a later part. The width change is one 220 ms slide, which
 * the reduced-motion rules in index.css remove.
 */
export function TutorPanelShell({ collapsed, onToggle }: TutorPanelShellProps) {
  return (
    <aside
      aria-label={t('bench.panelTitle')}
      data-collapsed={collapsed}
      className={cn(
        'shrink-0 overflow-hidden border-l-4 border-wood-dark bg-mat transition-[width] duration-base ease-bouncy',
        collapsed ? 'w-14' : 'w-[360px]',
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 py-3">
          <Ollie mood="happy" size={40} decorative />
          <Tooltip content={t('bench.showPanel')}>
            {(describedBy) => (
              <IconButton icon={PanelRightOpen} label={t('bench.showPanel')} aria-describedby={describedBy} onClick={onToggle} />
            )}
          </Tooltip>
        </div>
      ) : (
        <div className="flex w-[356px] flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <Ollie mood="happy" size={96} decorative />
            <IconButton icon={PanelRightClose} label={t('bench.hidePanel')} onClick={onToggle} />
          </div>
          <h2 className="font-heading text-xl font-semibold leading-7">{t('bench.panelTitle')}</h2>
        </div>
      )}
    </aside>
  );
}
