import type feedbackEn from '../spec/feedback.en.json';
import type uiEn from '../spec/ui-strings.en.json';

/** Languages whose files are loaded. Add 'hi' and 'mr' here when their files exist. */
export type Language = 'en';

/** Values a caller may put into {placeholders}. Arrays are joined by the caller. */
export type Params = Readonly<Record<string, string | number>>;

/** Flat keys of the feedback file; they may contain dots, e.g. 'OPEN_CIRCUIT.gap'. */
export type FeedbackKey = Exclude<keyof typeof feedbackEn, '_note'>;

type UiTree = Omit<typeof uiEn, '_note'>;

/** Dot-joined path to every string leaf of a nested tree. */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends object
      ? `${K}.${LeafPaths<T[K]>}`
      : never;
}[keyof T & string];

/** Nested paths into the UI file, e.g. 'exp.ohms-law.title'. */
export type UiKey = LeafPaths<UiTree>;

export type UiStrings = UiTree;
