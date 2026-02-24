import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        display: ['var(--font-syne)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
        premium: ['var(--font-sora)', 'var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      colors: {
        mgsr: {
          dark: '#0F1923',
          card: '#1A2736',
          border: '#253545',
          teal: '#4DB6AC',
          text: '#E8EAED',
          muted: '#8C999B',
          red: '#E53935',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        searchResultIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'search-result-in': 'searchResultIn 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
