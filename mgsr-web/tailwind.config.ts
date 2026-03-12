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
          accent: 'var(--mgsr-accent)',
          'accent-dim': 'var(--mgsr-accent-dim)',
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
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        warCardIn: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        radarSweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        orbitalSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        orbitalReverse: {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(168, 85, 247, 0.2)' },
          '50%': { borderColor: 'rgba(168, 85, 247, 0.5)' },
        },
        dotPulse: {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1.2)' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'search-result-in': 'searchResultIn 0.4s ease-out both',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'war-card-in': 'warCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'radar-sweep': 'radarSweep 2s linear infinite',
        'orbital-spin': 'orbitalSpin 1.5s linear infinite',
        'orbital-reverse': 'orbitalReverse 2s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'border-glow': 'borderGlow 2s ease-in-out infinite',
        'dot-pulse': 'dotPulse 1.4s ease-in-out infinite',
        'scan-line': 'scanLine 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
