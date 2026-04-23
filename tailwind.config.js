/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--color-paper) / <alpha-value>)',
          warm: 'rgb(var(--color-paper-warm) / <alpha-value>)',
          shade: 'rgb(var(--color-paper-shade) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          deep: 'rgb(var(--color-accent-deep) / <alpha-value>)',
          pale: 'rgb(var(--color-accent-pale) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        'sans-med': ['var(--font-sans-med)'],
        'sans-semi': ['var(--font-sans-semi)'],
        'sans-bold': ['var(--font-sans-bold)'],
        display: ['var(--font-display)'],
      },
    },
  },
  plugins: [],
};
