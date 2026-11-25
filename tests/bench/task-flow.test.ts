import { describe, expect, it } from 'vitest';
import {
  finishAttemptEvent,
  finishTaskEvent,
  nextTaskEvent,
  submitAnswerEvent,
  type EventContext,
} from '../../src/bench/events';
import { currentTaskFromEvents } from '../../src/bench/readings';
import { answerOutcome, finishLabel, isLastTask, nextTaskId, taskNeedsAnswer } from '../../src/bench/task-flow';
import type { AnswerSubmission, RuleResult } from '../../src/model/types';
import { ohmsLaw, seriesParallel } from './helpers';

function result(code: RuleResult['code'], severity: RuleResult['severity']): RuleResult {
  return {
    code,
    severity,
    stage: 'action',
    checkpoint: 'ANSWER_SUBMIT',
    feedbackKey: code,
    affected: { componentIds: [], wireIds: [], terminals: [] },
  };
}

const context: EventContext = { id: 'e1', timestamp: 77, userId: 'asha', attemptId: 'a1', experimentId: 'series-parallel' };

describe('task order', () => {
  it('finds the next task and the last one', () => {
    expect(nextTaskId(seriesParallel, 'series')).toBe('parallel');
    expect(nextTaskId(seriesParallel, 'parallel')).toBeUndefined();
    expect(nextTaskId(seriesParallel, 'nope')).toBeUndefined();
    expect(nextTaskId(ohmsLaw, 'main')).toBeUndefined();
    expect(isLastTask(seriesParallel, 'series')).toBe(false);
    expect(isLastTask(seriesParallel, 'parallel')).toBe(true);
    expect(isLastTask(ohmsLaw, 'main')).toBe(true);
    expect(isLastTask(ohmsLaw, 'nope')).toBe(false);
  });

  it('names the button: finish on the last task, next before it', () => {
    expect(finishLabel(seriesParallel, 'series')).toBe('next');
    expect(finishLabel(seriesParallel, 'parallel')).toBe('finish');
    expect(finishLabel(ohmsLaw, 'main')).toBe('finish');
  });

  it('knows which tasks need an equivalent answer', () => {
    expect(taskNeedsAnswer(seriesParallel, 'series')).toBe(true);
    expect(taskNeedsAnswer(seriesParallel, 'parallel')).toBe(true);
    expect(taskNeedsAnswer(ohmsLaw, 'main')).toBe(false);
    expect(taskNeedsAnswer(ohmsLaw, 'nope')).toBe(false);
  });
});

describe('answerOutcome', () => {
  it('reads the verdict from the check', () => {
    expect(answerOutcome([], [result('OK_ANSWER', 'ok')])).toBe('correct');
    expect(answerOutcome([result('EQUIVALENT_R_WRONG', 'error')], [])).toBe('wrong');
    expect(answerOutcome([result('MISSING_COMPONENT', 'error')], [])).toBe('blocked');
  });

  it('a wrong answer wins over other errors; no verdict at all fails loudly', () => {
    expect(answerOutcome([result('MISSING_COMPONENT', 'error'), result('EQUIVALENT_R_WRONG', 'error')], [])).toBe('wrong');
    expect(() => answerOutcome([], [])).toThrow();
  });
});

describe('events', () => {
  const answer: AnswerSubmission = { id: 'ans1', attemptId: 'a1', taskId: 'series', typed: 29.4, expected: 30, correct: true, timestamp: 77 };

  it('SUBMIT_ANSWER names the answer and what was judged', () => {
    expect(submitAnswerEvent(context, answer)).toEqual({
      id: 'e1', userId: 'asha', attemptId: 'a1', experimentId: 'series-parallel', timestamp: 77,
      taskId: 'series', actionType: 'SUBMIT_ANSWER', targetId: 'ans1', after: { typed: 29.4, expected: 30, correct: true },
    });
  });

  it('FINISH_TASK, NEXT_TASK and FINISH_ATTEMPT carry the task or attempt they are about', () => {
    expect(finishTaskEvent(context, 'series')).toMatchObject({ actionType: 'FINISH_TASK', taskId: 'series', targetId: 'series' });
    expect(nextTaskEvent(context, 'series', 'parallel')).toMatchObject({
      actionType: 'NEXT_TASK', taskId: 'parallel', targetId: 'parallel', before: { taskId: 'series' }, after: { taskId: 'parallel' },
    });
    expect(finishAttemptEvent(context, 'parallel')).toMatchObject({
      actionType: 'FINISH_ATTEMPT', taskId: 'parallel', targetId: 'a1', after: { status: 'completed' },
    });
  });

  it('a NEXT_TASK event is what currentTaskFromEvents reads', () => {
    expect(currentTaskFromEvents(seriesParallel, [nextTaskEvent(context, 'series', 'parallel')])).toBe('parallel');
    expect(currentTaskFromEvents(seriesParallel, [finishTaskEvent(context, 'series')])).toBe('series');
  });
});
