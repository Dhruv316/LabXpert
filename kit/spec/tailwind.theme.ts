// Drop-in Tailwind v3.4 theme extension generated from design-tokens.json.
// tailwind.config.ts:  import { labTheme } from './src/spec/tailwind.theme'; ... theme: { extend: labTheme }
export const labTheme = {
  colors: {
    cream: '#FFF6E5', mat: '#FDEBC8',
    wood: { DEFAULT: '#C98B52', dark: '#A86B3A', light: '#E2AE75' },
    orange: { DEFAULT: '#F28C28', deep: '#B85C00' },
    teal: { DEFAULT: '#1FA39B', deep: '#0F7A74', tint: '#BFEDE8' },
    plum: '#7A4FA3',
    ink: { DEFAULT: '#3A2A1A', soft: '#6B5644' },
    error: { DEFAULT: '#C0392B', tint: '#FBE3DF' },
    ok: { DEFAULT: '#2E7D4F', tint: '#DDF3E4' },
    warn: { DEFAULT: '#E8A200', tint: '#FFE9B8', text: '#7A4A00' },
    metal: '#B9C0C6',
  },
  fontFamily: {
    heading: ['Fredoka', 'Nunito', 'system-ui', 'sans-serif'],
    body: ['Nunito', 'system-ui', 'sans-serif'],
  },
  borderRadius: { small: '8px', control: '14px', card: '20px', panel: '24px' },
  boxShadow: {
    lift: '0 2px 0 #A86B3A, 0 8px 16px rgba(58,42,26,0.18)',
    press: '0 1px 0 #A86B3A, 0 3px 6px rgba(58,42,26,0.2)',
    panel: '0 10px 30px rgba(58,42,26,0.15)',
  },
  transitionTimingFunction: { bouncy: 'cubic-bezier(0.34, 1.3, 0.64, 1)' },
};
