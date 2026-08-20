import type { Config } from 'tailwindcss'

/*
 * Every colour goes through a token so both themes resolve (D1).
 * Nothing here invents a value - the tokens live in styles/globals.css.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './domain/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          strong: 'var(--brand-strong)',
          tint: 'var(--brand-tint)',
        },
        ink: { 1: 'var(--ink-1)', 2: 'var(--ink-2)' },
        muted: { 1: 'var(--muted-1)', 2: 'var(--muted-2)' },
        line: 'var(--border)',
        surface: 'var(--surface)',
        canvas: { DEFAULT: 'var(--page-bg)', soft: 'var(--canvas-soft)' },
        success: { DEFAULT: 'var(--success)', strong: 'var(--success-strong)' },
        warning: { DEFAULT: 'var(--warning)', strong: 'var(--warning-strong)' },
        danger: { DEFAULT: 'var(--danger)', strong: 'var(--danger-strong)' },
        ai: 'var(--accent-ai)',
        calc: 'var(--accent-calc)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      /* Foundations 02 type scale. */
      fontSize: {
        caption: ['11px', { lineHeight: '1.4' }],
        label: ['12px', { lineHeight: '1.2', fontWeight: '600' }],
        small: ['13px', { lineHeight: '1.5' }],
        body: ['14px', { lineHeight: '1.55' }],
        section: ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        page: ['26px', { lineHeight: '1.2', fontWeight: '600' }],
        metric: ['30px', { lineHeight: '1', fontWeight: '600' }],
        display: ['36px', { lineHeight: '1.1', fontWeight: '600' }],
      },
      /* Foundations 02: 8 controls, 12 inputs and cards, 16 panels. */
      borderRadius: { control: '8px', card: '12px', panel: '16px' },
      /* Elevation is reserved for overlays. Cards and tables never carry shadow. */
      boxShadow: { overlay: '0 12px 32px rgba(15, 23, 42, 0.12)' },
      spacing: { shell: '264px', rail: '72px', topbar: '64px', drawer: '420px' },
      maxWidth: { content: '1600px' },
    },
  },
  plugins: [],
}

export default config
