// How the top bar shares a narrow window: which items shrink, wrap or truncate at which width and text scale.
// Pure maths (no React, no DOM), so it can be tested without a browser; TopBar applies the result.

/** Sizes are CSS px at 100% text. Text zoom scales rem, so the room a bar has is the window width divided by the text scale. */
const CHAR_PX = { body: 9.2, chip: 8, heading: 11.5, button: 10 } as const;

export const TOPBAR_MIN_CONTROL_PX = 44;
export const TOPBAR_MIN_TEXT_PX = 14;

export type TopBarTier = 'roomy' | 'snug' | 'tight';

export interface TopBarLabels {
  appName: string;
  /** The longer of the online and offline words. */
  chip: string;
  reduceMotion: string;
  logout: string;
}

export interface TopBarInput {
  viewportWidth: number;
  /** Root font size over 16 (1 = 100%, 1.25 = 125%). */
  textScale: number;
  userName: string;
  labels: TopBarLabels;
}

interface TierSpec {
  /** Bar side padding and the gap between its items, in px. */
  padX: number;
  gap: number;
  logo: number;
  /** The app name's font size in px (never under 14). */
  appNamePx: number;
  /** The user name stops growing at this width (rem), then truncates with an ellipsis. */
  nameMaxRem: number;
  /** A two-word label wraps onto two lines instead of staying on one. */
  wrapLabels: boolean;
  languageRem: number;
  /** Side padding of the language select and of Log out, in px. */
  controlPadX: number;
}

const TIERS: Record<TopBarTier, TierSpec> = {
  roomy: { padX: 24, gap: 12, logo: 40, appNamePx: 20, nameMaxRem: 10, wrapLabels: false, languageRem: 8, controlPadX: 24 },
  snug: { padX: 16, gap: 8, logo: 40, appNamePx: 20, nameMaxRem: 7, wrapLabels: false, languageRem: 7.5, controlPadX: 16 },
  tight: { padX: 12, gap: 8, logo: 32, appNamePx: 18, nameMaxRem: 5, wrapLabels: true, languageRem: 7, controlPadX: 12 },
};

/** Roomiest first: the first tier whose parts fit beside the logo and the app name is used. */
const ORDER: readonly TopBarTier[] = ['roomy', 'snug', 'tight'];

export interface TopBarLayout {
  tier: TopBarTier;
  padX: number;
  gap: number;
  logo: number;
  appNamePx: number;
  /** The app name is always shown, in full; only the logo and the type size shrink. */
  appNameVisible: true;
  /** Smallest width (rem) the logo and app name may be squeezed to: the experiment title gives way first. */
  leftMinRem: number;
  nameMaxRem: number;
  nameTruncated: boolean;
  /** The full name, whatever is drawn: for assistive tech and the hover title. */
  accessibleName: string;
  wrapLabels: boolean;
  languageRem: number;
  controlPadX: number;
  minControlPx: number;
  minTextPx: number;
  /** Estimated px the right-hand items need, and the px left for them beside the logo and app name. */
  rightPx: number;
  availablePx: number;
  /** False only when even the tightest tier is estimated to be too wide; the bar then wraps onto a second row. */
  fits: boolean;
}

const longestWord = (text: string): number =>
  Math.max(1, ...text.split(/\s+/).map((word) => word.length));

function measure(spec: TierSpec, input: TopBarInput) {
  const { labels, userName } = input;
  const chipChars = spec.wrapLabels ? longestWord(labels.chip) : labels.chip.length;
  const switchChars = spec.wrapLabels ? longestWord(labels.reduceMotion) : labels.reduceMotion.length;
  const chip = 4 + 24 + 16 + 8 + chipChars * CHAR_PX.chip;
  const reduceSwitch = 16 + 44 + 8 + switchChars * CHAR_PX.body;
  const language = 20 + 8 + spec.languageRem * 16;
  const nameNatural = userName.length * CHAR_PX.body;
  const name = Math.min(nameNatural, spec.nameMaxRem * 16);
  const logout = spec.controlPadX * 2 + 20 + 8 + labels.logout.length * CHAR_PX.button;
  const user = name + 4 + logout;
  const left = spec.logo + 12 + labels.appName.length * (spec.appNamePx * (CHAR_PX.heading / 20));
  return { left, right: chip + reduceSwitch + language + user + spec.gap * 3, nameNatural };
}

export function topBarLayout(input: TopBarInput): TopBarLayout {
  const scale = Number.isFinite(input.textScale) && input.textScale > 0 ? input.textScale : 1;
  const room = input.viewportWidth / scale;
  const trimmed = input.userName.trim();

  const fitting = ORDER.find((tier) => {
    const spec = TIERS[tier];
    const m = measure(spec, input);
    return spec.padX * 2 + m.left + spec.gap + m.right <= room;
  });
  const tier = fitting ?? 'tight';
  const spec = TIERS[tier];
  const m = measure(spec, input);
  const availablePx = room - spec.padX * 2 - m.left - spec.gap;

  return {
    tier,
    padX: spec.padX,
    gap: spec.gap,
    logo: spec.logo,
    appNamePx: spec.appNamePx,
    appNameVisible: true,
    leftMinRem: m.left / 16,
    nameMaxRem: spec.nameMaxRem,
    nameTruncated: m.nameNatural > spec.nameMaxRem * 16,
    accessibleName: trimmed,
    wrapLabels: spec.wrapLabels,
    languageRem: spec.languageRem,
    controlPadX: spec.controlPadX,
    minControlPx: TOPBAR_MIN_CONTROL_PX,
    minTextPx: TOPBAR_MIN_TEXT_PX,
    rightPx: m.right,
    availablePx,
    fits: fitting !== undefined,
  };
}
