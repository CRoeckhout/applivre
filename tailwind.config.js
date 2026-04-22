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
          DEFAULT: '#1a1410',
          soft: '#3a322b',
          muted: '#6b6259',
        },
        paper: {
          DEFAULT: '#fbf8f4',
          warm: '#f3ecdf',
          shade: '#e8dfce',
        },
        accent: {
          DEFAULT: '#c27b52',
          deep: '#9b5a38',
          pale: '#f2d9c6',
        },
      },
      fontFamily: {
        sans: ['DMSans_400Regular'],
        'sans-med': ['DMSans_500Medium'],
        'sans-semi': ['DMSans_600SemiBold'],
        'sans-bold': ['DMSans_700Bold'],
        display: ['DMSans_600SemiBold'],
      },
    },
  },
  plugins: [],
};
