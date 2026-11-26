import { useState } from 'react';
import { Eraser, Trash2, Undo2 } from 'lucide-react';
import { findComponent, isEmpty } from '../../bench/ops';
import { Button, Dialog, cn } from '../../components/ui';
import { t } from '../../i18n';
import { useBenchStore } from '../../state';
import { PracticeProgress } from './PracticeProgress';
import { TaskProgress } from './TaskProgress';
import { useBenchActions } from './use-bench-actions';

/** Narrow side padding for the three buttons when the roomy ones would need a second row (toolbar-layout.ts). */
const TIGHT = '!px-3';

/** A 44 px button (the design's smallest control) in the short-window toolbar, which has no room for 48 px ones. */
const SHORT = '!min-h-[44px]';

/**
 * Top of the bench: Undo and Clear bench, plus the selection toolbar (Remove) when a part is
 * selected. Clear asks first; the dialog lists the safe choice first so it takes focus.
 */
export function BenchToolbar({ compact = false, tight = false }: { compact?: boolean; tight?: boolean }) {
  const circuit = useBenchStore((state) => state.circuit);
  const canUndo = useBenchStore((state) => state.history.length > 0);
  const selectedId = useBenchStore((state) => state.selectedId);
  const selectedWireId = useBenchStore((state) => state.selectedWireId);
  const actions = useBenchActions();
  const [confirming, setConfirming] = useState(false);
  const buttonClass = cn(compact && SHORT, tight && TIGHT) || undefined;

  const selected = selectedId === undefined ? undefined : findComponent(circuit, selectedId);
  const wireSelected = selectedWireId !== undefined && circuit.wires.some((wire) => wire.id === selectedWireId);
  const removeSelectedWire = () => {
    if (selectedWireId !== undefined) actions.removeWire(selectedWireId);
  };

  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3',
        compact ? 'min-h-[48px] py-0' : 'min-h-[56px] py-1',
      )}
    >
      <div className="flex items-center gap-2">
        <Button variant="quiet" icon={Undo2} className={buttonClass} disabled={!canUndo} onClick={actions.undo}>
          {t('bench.undo')}
        </Button>
        <Button variant="quiet" icon={Eraser} className={buttonClass} disabled={isEmpty(circuit)} onClick={() => setConfirming(true)}>
          {t('bench.reset')}
        </Button>
      </div>
      {(selected !== undefined || wireSelected) && (
        <div
          data-testid="selection-toolbar"
          className="flex items-center gap-2 rounded-control border-2 border-dashed border-teal bg-cream px-2"
        >
          <Button
            variant="quiet"
            icon={Trash2}
            className={buttonClass}
            disabled={selected?.locked === true}
            onClick={() => (selected !== undefined ? actions.remove(selected.id) : removeSelectedWire())}
          >
            {t('bench.deleteSelected')}
          </Button>
        </div>
      )}
      <TaskProgress />
      <PracticeProgress />
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('bench.resetConfirmTitle')}
        closeLabel={t('common.close')}
        actions={
          <>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              {t('bench.resetConfirmNo')}
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                actions.clear();
              }}
            >
              {t('bench.resetConfirmYes')}
            </Button>
          </>
        }
      >
        <p>{t('bench.resetConfirmBody')}</p>
      </Dialog>
    </div>
  );
}
