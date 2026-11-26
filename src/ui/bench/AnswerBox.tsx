import { useRef, useState, type KeyboardEvent } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { answerFeedbackKey, observedForLine, parseAnswer } from '../../bench/answer-field';
import { Button, Field, Icon, cn } from '../../components/ui';
import { isFeedbackKey, t } from '../../i18n';
import type { ExperimentConfig, Reading } from '../../model/types';
import { findTask } from '../../bench/task-flow';
import { selectLastAnswer, useReadingsStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';

export interface AnswerBoxProps {
  experiment: ExperimentConfig;
  taskId: string;
  /** The current task's readings, oldest first. */
  readings: Reading[];
  /**
   * The short-window dock: the parts become cells of the dock footer's grid (the box itself and the slot
   * around it take no box of their own), so the verdict can sit beside the Finish button. Tab order is unchanged.
   */
  compact?: boolean;
}

// Compact cells of the footer grid (7rem to 14rem, auto, 1fr): the field above-left, Check at its right, the verdict under the field.
const COMPACT_FIELD = 'col-start-1 row-start-1 [&_input]:h-11 [&_label]:leading-5';
const COMPACT_CHECK = 'col-start-2 row-start-1 shrink-0 self-end !min-h-[44px] !px-4';
const COMPACT_RESULT = 'col-start-1 row-start-2 flex min-w-0 flex-col justify-center font-body text-sm font-semibold leading-[18px] text-ink';

/** The title line of a feedback entry, or undefined when the task has no such wording. */
function feedbackTitle(key: string | undefined): string | undefined {
  return key !== undefined && isFeedbackKey(key) ? t(key).title : undefined;
}

/**
 * The equivalent-resistance box: a labelled number field, Check, the verdict of the last Check and the
 * observed V ÷ I. The verdict is read from the saved answers, so it survives a reload and starts empty
 * on the next task. What the student typed is kept (a wrong answer can be edited and tried again).
 */
export function AnswerBox({ experiment, taskId, readings, compact = false }: AnswerBoxProps) {
  const answers = useReadingsStore((state) => state.answers);
  const submitAnswer = useReadingsStore((state) => state.submitAnswer);
  const announce = useAnnounce();
  const crash = useCrash();
  const inputRef = useRef<HTMLInputElement>(null);
  // One Check at a time: a second press while the first is still being saved is ignored.
  const working = useRef(false);
  // Typed text and the "type a number" message belong to the task they were made on, so a new task starts clean.
  const [draft, setDraft] = useState<{ taskId: string; text: string } | undefined>(undefined);
  const [missingFor, setMissingFor] = useState<string | undefined>(undefined);

  const task = findTask(experiment, taskId);
  const last = selectLastAnswer(answers, taskId);
  const text = draft?.taskId === taskId ? draft.text : last === undefined ? '' : String(last.typed);
  const needNumber = missingFor === taskId;

  const verdict = last === undefined || task === undefined ? undefined : feedbackTitle(answerFeedbackKey(task, last.correct));
  const observed = observedForLine(readings, last);
  const correct = last?.correct === true;

  const submit = () => {
    if (working.current) return;
    const value = parseAnswer(text);
    if (value === undefined) {
      setMissingFor(taskId);
      inputRef.current?.focus();
      return;
    }
    setMissingFor(undefined);
    working.current = true;
    submitAnswer(value)
      .then((result) => {
        // A wrong answer is announced by the tutor panel with its feedback; a right one is said here.
        if (result.status === 'correct') announce(t('OK_ANSWER').title);
      })
      .catch(crash)
      .finally(() => {
        working.current = false;
      });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  };

  return (
    <div data-answer-box className={compact ? 'contents' : 'flex min-w-0 items-start gap-3'}>
      <div className={compact ? COMPACT_FIELD : 'w-72 shrink-0'}>
        <Field
          ref={inputRef}
          label={t('bench.equivalentLabel')}
          type="number"
          inputMode="decimal"
          step="any"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setDraft({ taskId, text: event.target.value });
            setMissingFor(undefined);
          }}
          onKeyDown={onKeyDown}
          error={needNumber ? t('bench.answerNeedNumber') : undefined}
        />
      </div>
      {/* Lined up with the input: the label above it is one 24 px line plus a 4 px gap. */}
      <Button variant="secondary" className={compact ? COMPACT_CHECK : 'mt-7 shrink-0'} onClick={submit}>
        {t('bench.check')}
      </Button>
      <div
        className={cn(
          compact
            ? COMPACT_RESULT
            : 'mt-7 flex min-h-[48px] min-w-0 flex-1 flex-col justify-center font-body text-sm font-semibold text-ink',
        )}
      >
        {verdict !== undefined && !needNumber && (
          <p data-answer-result={correct ? 'correct' : 'wrong'} className="flex items-start gap-2">
            <Icon icon={correct ? Check : CircleAlert} className={correct ? 'shrink-0 text-ok' : 'shrink-0 text-error'} />
            <span>{verdict}</span>
          </p>
        )}
        {observed !== undefined && <p data-observed>{t('bench.calculatedVsObserved', { observed })}</p>}
      </div>
    </div>
  );
}
