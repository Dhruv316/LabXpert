// The words a practice screen shows, looked up from the keys the task and its error code point to.
import { isUiKey, t, UnknownTextKeyError } from '../../i18n';
import type { ErrorCode, PracticeTask } from '../../model/types';

/** Task text arrives as a key string from `practice-tasks.json`; an unknown key is a spec error, not a student one. */
function textFor(key: string): string {
  if (!isUiKey(key)) throw new UnknownTextKeyError(key);
  return t(key);
}

export function practiceTitle(task: PracticeTask): string {
  return textFor(task.titleKey);
}

export function practiceGoal(task: PracticeTask): string {
  return textFor(task.goalKey);
}

/** "Ollie picked this for you because of: <topic>." or, for an extension task, the extra-challenge line. */
export function practiceBannerText(task: PracticeTask, forCode: ErrorCode | undefined): string {
  if (task.role === 'extension') return t('practice.bannerExtension');
  // A practice task is only ever started for a mistake, so a missing code is a data bug.
  if (forCode === undefined) throw new Error(`Practice task ${task.id} has no triggering code`);
  return t('practice.bannerPicked', { topic: textFor(`errorTopics.${forCode}`) });
}
