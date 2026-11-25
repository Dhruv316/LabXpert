// What the My progress screen shows, worked out from saved records. Pure: no React, no database.
import { choiceForCode } from '../../db/suggest';
import { isUiKey, t, UnknownTextKeyError, type Language } from '../../i18n';
import type { ErrorCode, ErrorProfileEntry, ExperimentId, PracticeRecord, PracticeTask } from '../../model/types';

export interface TopicRow {
  /** Identifies the row (React key) and the code behind it. Never shown. */
  id: ErrorCode;
  topic: string;
  /** "1 time" or "3 times". */
  countText: string;
  /** Where Start practice goes. */
  taskId: string;
}

export interface PracticeRow {
  /** Identifies the row (React key). Never shown. */
  id: string;
  title: string;
  date: string;
  clean: boolean;
  resultText: string;
}

/** Text that arrives as a key string from a spec file; an unknown key is a spec error, not a student one. */
export function textForKey(key: string): string {
  if (!isUiKey(key)) throw new UnknownTextKeyError(key);
  return t(key);
}

export function bestResultText(kinds: number): string {
  if (kinds === 0) return t('progress.bestResultNone');
  if (kinds === 1) return t('progress.bestResultOne');
  return t('progress.bestResultMany', { count: kinds });
}

export function countText(count: number): string {
  return count === 1 ? t('result.mistakeCount', { count }) : t('result.mistakeCountPlural', { count });
}

interface Group {
  code: ErrorCode;
  total: number;
  lastSeenAt: number;
  /** This code's entries, most seen first, ties to the most recent, so the task follows where it was seen most. */
  entries: ErrorProfileEntry[];
}

function moreSeen(a: ErrorProfileEntry, b: ErrorProfileEntry): number {
  return b.count - a.count || b.lastSeenAt - a.lastSeenAt || (a.experimentId < b.experimentId ? -1 : a.experimentId > b.experimentId ? 1 : 0);
}

/**
 * One row per unresolved code (count above 0) across all experiments, most seen first, ties to the most
 * recent, then by code. A code with no practice task is a data bug and fails like `t()`.
 */
export function topicRows(profile: readonly ErrorProfileEntry[], tasks: PracticeTask[]): TopicRow[] {
  const groups = new Map<ErrorCode, Group>();
  for (const entry of profile) {
    if (entry.count <= 0) continue;
    const group = groups.get(entry.code);
    if (group === undefined) {
      groups.set(entry.code, { code: entry.code, total: entry.count, lastSeenAt: entry.lastSeenAt, entries: [entry] });
    } else {
      group.total += entry.count;
      group.lastSeenAt = Math.max(group.lastSeenAt, entry.lastSeenAt);
      group.entries.push(entry);
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.total - a.total || b.lastSeenAt - a.lastSeenAt || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((group) => {
      const topicKey = `errorTopics.${group.code}`;
      const taskId = taskIdFor(group, tasks);
      return { id: group.code, topic: textForKey(topicKey), countText: countText(group.total), taskId };
    });
}

function taskIdFor(group: Group, tasks: PracticeTask[]): string {
  const experiments: ExperimentId[] = group.entries.slice().sort(moreSeen).map((entry) => entry.experimentId);
  for (const experimentId of experiments) {
    const choice = choiceForCode(tasks, experimentId, group.code);
    if (choice !== undefined) return choice.task.id;
  }
  throw new UnknownTextKeyError(`practice task for ${group.code}`);
}

/** Completed practice, newest first (the order `listPracticeHistory` returns). */
export function practiceRows(records: readonly PracticeRecord[], tasks: readonly PracticeTask[], language: Language): PracticeRow[] {
  // Made per call so the date follows the app's current language and never a hard-coded format.
  const format = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
  return records.flatMap((record): PracticeRow[] => {
    if (record.completedAt === undefined) return [];
    const task = tasks.find((candidate) => candidate.id === record.practiceTaskId);
    if (task === undefined) throw new UnknownTextKeyError(record.practiceTaskId);
    const clean = record.clean === true;
    return [
      {
        id: record.id,
        title: textForKey(task.titleKey),
        date: format.format(record.completedAt),
        clean,
        resultText: clean ? t('progress.practiceClean') : t('progress.practiceNotClean'),
      },
    ];
  });
}

