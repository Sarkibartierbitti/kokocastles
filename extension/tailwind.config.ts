import type { Config } from 'tailwindcss';

export default {
  content: [
    './entrypoints/**/*.{html,tsx,ts}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        koko: {
          sky: '#BAE6FD',
          'sky-deep': '#7DD3FC',
          pink: '#FBCFE8',
          'pink-deep': '#F9A8D4',
        },
      },
      fontFamily: {
        display: ['"Quicksand"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config;
