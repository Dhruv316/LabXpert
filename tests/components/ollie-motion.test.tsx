import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { Ollie } from '../../src/components/Ollie';
import { MotionScope, useMotionReduced, useReducedMotion } from '../../src/components/ui';
import { t } from '../../src/i18n';

function setOsReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
  delete document.documentElement.dataset.reduceMotion;
});

describe('Ollie', () => {
  it('has the accessible name from t(), for every mood', () => {
    for (const mood of ['happy', 'thinking', 'celebrating'] as const) {
      const { unmount } = render(<Ollie mood={mood} />);
      expect(screen.getByRole('img', { name: t('app.owlName') })).not.toBeNull();
      unmount();
    }
  });

  it('draws a different pose per mood, inline, with no hard-coded title text', () => {
    const markup = (['happy', 'thinking', 'celebrating'] as const).map((mood) => {
      const { container, unmount } = render(<Ollie mood={mood} />);
      const svg = container.querySelector('svg');
      const html = svg?.innerHTML ?? '';
      unmount();
      return html;
    });
    expect(new Set(markup).size).toBe(3);
    for (const html of markup) {
      expect(html.length).toBeGreaterThan(100);
      expect(html).not.toContain('<title>');
    }
  });

  it('uses the kit view box and keeps its aspect ratio at the requested width', () => {
    const { container } = render(<Ollie mood="happy" size={148} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('-14 -4 148 128');
    expect(svg?.getAttribute('width')).toBe('148');
    expect(svg?.getAttribute('height')).toBe('128');
  });

  it('is hidden from assistive tech when decorative', () => {
    const { container } = render(<Ollie mood="happy" decorative />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('bounces once when the mood changes, not on first render, and never when motion is reduced', () => {
    const { container, rerender } = render(<Ollie mood="happy" />);
    expect(container.querySelector('[data-mood]')?.className).not.toContain('animate-owl-bounce');
    rerender(<Ollie mood="thinking" />);
    expect(container.querySelector('[data-mood]')?.className).toContain('animate-owl-bounce');
    cleanup();

    const reduced = render(
      <MotionScope reduce>
        <Ollie mood="happy" />
      </MotionScope>,
    );
    reduced.rerender(
      <MotionScope reduce>
        <Ollie mood="thinking" />
      </MotionScope>,
    );
    expect(reduced.container.querySelector('[data-mood]')?.className).not.toContain('animate-owl-bounce');
  });
});

describe('reduced motion', () => {
  it('is off when neither the setting nor the OS asks for it', () => {
    setOsReducedMotion(false);
    expect(renderHook(() => useReducedMotion(false)).result.current).toBe(false);
  });

  it('is on when the in-app setting is on', () => {
    setOsReducedMotion(false);
    expect(renderHook(() => useReducedMotion(true)).result.current).toBe(true);
  });

  it('is on when the OS asks for it, even with the setting off', () => {
    setOsReducedMotion(true);
    expect(renderHook(() => useReducedMotion(false)).result.current).toBe(true);
  });

  it('works where matchMedia does not exist', () => {
    expect(renderHook(() => useReducedMotion(false)).result.current).toBe(false);
  });

  it('MotionScope marks <html> and shares the value, and cleans up', () => {
    setOsReducedMotion(false);
    const seen = vi.fn();
    function Probe() {
      seen(useMotionReduced());
      return null;
    }
    const { rerender, unmount } = render(
      <MotionScope reduce={false}>
        <Probe />
      </MotionScope>,
    );
    expect(document.documentElement.dataset.reduceMotion).toBe('false');
    expect(seen).toHaveBeenLastCalledWith(false);

    rerender(
      <MotionScope reduce>
        <Probe />
      </MotionScope>,
    );
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(seen).toHaveBeenLastCalledWith(true);

    unmount();
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();
  });
});
