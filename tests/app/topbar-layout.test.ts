import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import {
  TOPBAR_MIN_CONTROL_PX,
  TOPBAR_MIN_TEXT_PX,
  topBarLayout,
  type TopBarLabels,
} from '../../src/ui/shell/topbar-layout';

const LABELS: TopBarLabels = {
  appName: t('app.name'),
  chip: t('common.online').length >= t('common.offline').length ? t('common.online') : t('common.offline'),
  reduceMotion: t('common.reduceMotion'),
  logout: t('common.logout'),
};

const SHORT = 'Asha';
const LONG = 'Priyadarshini Venkataraghavan-Subramaniam';
const WIDTHS = [1024, 1100, 1280, 1366] as const;
const SCALES = [1, 1.25] as const;

describe('top bar layout rule', () => {
  for (const width of WIDTHS) {
    for (const scale of SCALES) {
      for (const name of [SHORT, LONG]) {
        const label = `${width} px, ${Math.round(scale * 100)}% text, ${name === SHORT ? 'short' : 'very long'} name`;

        it(`${label}: the parts fit without overlap`, () => {
          const layout = topBarLayout({ viewportWidth: width, textScale: scale, userName: name, labels: LABELS });
          expect(layout.fits).toBe(true);
          expect(layout.rightPx).toBeLessThanOrEqual(layout.availablePx);
        });

        it(`${label}: minimum sizes, the app name and the full name are kept`, () => {
          const layout = topBarLayout({ viewportWidth: width, textScale: scale, userName: name, labels: LABELS });
          expect(layout.minControlPx).toBeGreaterThanOrEqual(44);
          expect(layout.minTextPx).toBeGreaterThanOrEqual(14);
          expect(layout.appNamePx).toBeGreaterThanOrEqual(TOPBAR_MIN_TEXT_PX);
          expect(layout.appNameVisible).toBe(true);
          expect(layout.accessibleName).toBe(name);
          // A name is only drawn shorter when it is longer than its cap.
          expect(layout.nameTruncated).toBe(name === LONG);
        });
      }
    }
  }

  it('exports the 44 px control and 14 px text minimums', () => {
    expect(TOPBAR_MIN_CONTROL_PX).toBe(44);
    expect(TOPBAR_MIN_TEXT_PX).toBe(14);
  });

  it('changes nothing at the design size (1366 px, 100%): roomiest tier, short labels on one line', () => {
    const layout = topBarLayout({ viewportWidth: 1366, textScale: 1, userName: SHORT, labels: LABELS });
    expect(layout.tier).toBe('roomy');
    expect(layout.wrapLabels).toBe(false);
    expect(layout.logo).toBe(40);
  });

  it('gets tighter as the window narrows or the text grows, never roomier', () => {
    const order = ['roomy', 'snug', 'tight'];
    const tierAt = (width: number, scale: number) =>
      order.indexOf(topBarLayout({ viewportWidth: width, textScale: scale, userName: LONG, labels: LABELS }).tier);
    expect(tierAt(1024, 1.25)).toBeGreaterThanOrEqual(tierAt(1366, 1.25));
    expect(tierAt(1100, 1.25)).toBeGreaterThanOrEqual(tierAt(1280, 1.25));
    expect(tierAt(1024, 1.25)).toBeGreaterThanOrEqual(tierAt(1024, 1));
  });

  it('at 1024 px and 125% text it wraps the chip and switch words and shrinks the logo', () => {
    const layout = topBarLayout({ viewportWidth: 1024, textScale: 1.25, userName: LONG, labels: LABELS });
    expect(layout.tier).toBe('tight');
    expect(layout.wrapLabels).toBe(true);
    expect(layout.logo).toBeLessThan(40);
  });

  it('keeps the app name visible even in a window too narrow for everything', () => {
    const layout = topBarLayout({ viewportWidth: 400, textScale: 2, userName: LONG, labels: LABELS });
    expect(layout.fits).toBe(false);
    expect(layout.appNameVisible).toBe(true);
    expect(layout.accessibleName).toBe(LONG);
  });

  it('treats a bad text scale as 100% and trims the accessible name', () => {
    const base = topBarLayout({ viewportWidth: 1280, textScale: 1, userName: SHORT, labels: LABELS });
    const bad = topBarLayout({ viewportWidth: 1280, textScale: Number.NaN, userName: `  ${SHORT} `, labels: LABELS });
    expect(bad.tier).toBe(base.tier);
    expect(bad.accessibleName).toBe(SHORT);
  });
});
