import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Gallery from '../../src/components/ui/Gallery';
import { MotionScope, ToastProvider, UI_COMPONENT_NAMES } from '../../src/components/ui';

afterEach(cleanup);

describe('Gallery', () => {
  it('shows every general-purpose component and Ollie', () => {
    const { container } = render(
      <MotionScope reduce={false}>
        <ToastProvider>
          <Gallery />
        </ToastProvider>
      </MotionScope>,
    );
    for (const name of [...UI_COMPONENT_NAMES, 'Ollie']) {
      expect(container.querySelector(`[data-gallery-component="${name}"]`), name).not.toBeNull();
    }
  });

  it('shows every button variant in every state', () => {
    const { container } = render(
      <MotionScope reduce={false}>
        <ToastProvider>
          <Gallery />
        </ToastProvider>
      </MotionScope>,
    );
    for (const variant of ['primary', 'secondary', 'quiet']) {
      for (const caption of [`${variant} default`, `${variant} hover`, `${variant} active`, `${variant} focus`, `${variant} disabled`]) {
        expect(container.querySelector(`[data-caption="${caption}"]`), caption).not.toBeNull();
      }
    }
  });
});

const sources = import.meta.glob<string>('../../src/components/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('component source rules', () => {
  const files = Object.entries(sources);

  it('finds the component files', () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it('has no raw hex colours (token names only)', () => {
    for (const [path, text] of files) {
      expect(/#[0-9a-fA-F]{3,8}\b/.test(text), path).toBe(false);
    }
  });

  it('has no `any` and no browser storage', () => {
    for (const [path, text] of files) {
      expect(/:\s*any\b|\bas any\b|<any>/.test(text), `${path} any`).toBe(false);
      expect(/localStorage|sessionStorage/.test(text), `${path} storage`).toBe(false);
    }
  });

  it('has no student-facing text in JSX (text must come from t())', () => {
    // Plain words between tags, e.g. <p>Hello</p>. Expressions like {t('x')} are fine.
    for (const [path, text] of files.filter(([p]) => p.endsWith('.tsx'))) {
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(/>\s*[A-Za-z][A-Za-z ]+\s*</.test(stripped), path).toBe(false);
    }
  });
});
