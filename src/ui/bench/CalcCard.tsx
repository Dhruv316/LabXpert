import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { parseAnswer } from '../../bench/answer-field';
import type { CalcPair } from '../../bench/calc-cards';
import { Button, Card, Field, Icon } from '../../components/ui';
import { t } from '../../i18n';
import { usePracticeStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';
import { CalcDrawing, calcName } from './CalcDrawing';

export interface CalcCardProps {
  index: number;
  pair: CalcPair;
  /** Answered correctly: the card is locked. */
  done: boolean;
  /** The field's text for a card that was answered before the screen opened (a reload). */
  answeredText: string;
  /** Lets the screen move focus to the next card's field. */
  registerInput: (index: number, element: HTMLInputElement | null) => void;
  /** Called after a correct answer was saved. */
  onCorrect: (index: number) => void;
}

/**
 * One calculation card: the drawing, the prompt, a labelled number field and Check. A wrong answer keeps what was
 * typed and can be tried again any number of times; a right one locks the card. The expected value is never shown.
 */
export function CalcCard({ index, pair, done, answeredText, registerInput, onCorrect }: CalcCardProps) {
  const announce = useAnnounce();
  const crash = useCrash();
  const verdictId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // One Check at a time: a second press while the first is still being saved is ignored.
  const working = useRef(false);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [needNumber, setNeedNumber] = useState(false);
  const [wrong, setWrong] = useState(false);

  const text = draft ?? answeredText;
  const setInput = useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      registerInput(index, element);
    },
    [index, registerInput],
  );

  const submit = () => {
    if (done || working.current) return;
    const value = parseAnswer(text);
    if (value === undefined) {
      setNeedNumber(true);
      setWrong(false);
      inputRef.current?.focus();
      return;
    }
    setNeedNumber(false);
    working.current = true;
    usePracticeStore
      .getState()
      .submitCalcAnswer(index, value)
      .then((result) => {
        if (result.status === 'correct') {
          setWrong(false);
          announce(t('practice.calcCorrect'));
          onCorrect(index);
        } else if (result.status === 'wrong') {
          setWrong(true);
          announce(t('practice.calcWrong'));
        }
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

  const verdict = done ? 'correct' : wrong && !needNumber ? 'wrong' : undefined;

  return (
    <Card
      role="group"
      aria-label={calcName(pair)}
      data-calc-card={index}
      data-done={done ? 'true' : 'false'}
      className={done ? 'border-l-4 border-ok' : 'border-l-4 border-wood-light'}
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <CalcDrawing pair={pair} />
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-3">
          <p className="font-heading text-xl font-medium leading-7 text-ink">{t('practice.calcPrompt')}</p>
          <div className="flex items-start gap-3">
            <div className="w-56 shrink-0">
              <Field
                ref={setInput}
                label={t('practice.calcAnswer')}
                type="number"
                inputMode="decimal"
                step="any"
                autoComplete="off"
                value={text}
                readOnly={done}
                aria-readonly={done ? true : undefined}
                aria-describedby={verdict !== undefined ? verdictId : undefined}
                onChange={(event) => {
                  // A locked card keeps what was typed (the browser blocks typing; this covers any other change).
                  if (done) return;
                  setDraft(event.target.value);
                  setNeedNumber(false);
                  setWrong(false);
                }}
                onKeyDown={onKeyDown}
                error={needNumber ? t('bench.answerNeedNumber') : undefined}
              />
            </div>
            {/* Lined up with the input: the label above it is one 26 px line (body 16/26) plus the 4 px gap, in rem so it follows the text size. */}
            <Button variant="secondary" className="mt-[1.875rem] shrink-0" disabled={done} onClick={submit}>
              {t('bench.check')}
            </Button>
          </div>
          <div className="min-h-[1.625rem] font-body text-base font-semibold text-ink">
            {verdict !== undefined && (
              <p id={verdictId} data-calc-result={verdict} className="flex items-start gap-2">
                <Icon icon={verdict === 'correct' ? Check : CircleAlert} className={verdict === 'correct' ? 'mt-0.5 shrink-0 text-ok' : 'mt-0.5 shrink-0 text-error'} />
                <span>{verdict === 'correct' ? t('practice.calcCorrect') : t('practice.calcWrong')}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
