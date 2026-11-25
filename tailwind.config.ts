import type { Config } from 'tailwindcss';
import { labTheme } from './src/spec/tailwind.theme';

const EASING = 'cubic-bezier(0.34, 1.3, 0.64, 1)';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      ...labTheme,
      // radius.pill (999) is in design-tokens.json but not in the generated theme, so `rounded-pill` made no CSS
      // and the toast and the R1/R2 badge were square. The other four radii come from labTheme.
      borderRadius: { ...labTheme.borderRadius, pill: '999px' },
      // Motion tokens from design-tokens.json (fast 120, base 220, needle 320).
      // shadow.component from design-tokens.json: how a part sits on the mat.
      dropShadow: { component: '0 6px 6px rgba(58,42,26,0.25)' },
      transitionDuration: { fast: '120ms', base: '220ms', needle: '320ms' },
      keyframes: {
        'owl-bounce': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.12)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        // One pulse (bright, a dip, settle). No 100% frame: it ends on the element's own steady style.
        'error-pulse': { '0%': { opacity: '0.25' }, '35%': { opacity: '1' }, '65%': { opacity: '0.4' } },
      },
      animation: {
        'owl-bounce': `owl-bounce 160ms ${EASING} 1`,
        'toast-in': 'toast-in 120ms ease-out 1',
        'fade-in': 'fade-in 220ms ease-out 1',
        'error-pulse': 'error-pulse 800ms ease-in-out 1',
      },
    },
  },
};

export default config;
