import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        app: {
          bg: 'var(--app-bg)',
          surface: 'var(--app-surface)',
          panel: 'var(--app-panel)',
          border: 'var(--app-border)',
          muted: 'var(--app-muted)',
          hover: 'var(--app-hover)',
          text: 'var(--app-text)',
          subtext: 'var(--app-subtext)',
          accent: 'var(--app-accent)',
          accentBg: 'var(--app-accent-bg)',
          accentBorder: 'var(--app-accent-border)',
        },
        slate: {
          950: '#020617',
          900: '#0f172a',
          850: '#0b1120',
          800: '#1e293b',
        },
        cyber: {
          cyan: '#22d3ee',
          violet: '#8b5cf6',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px -3px rgba(34, 211, 238, 0.35)',
        'neon-violet': '0 0 20px -3px rgba(139, 92, 246, 0.35)',
        'neon-rose': '0 0 20px -3px rgba(244, 63, 94, 0.35)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(34, 211, 238, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(34, 211, 238, 0.6)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;
