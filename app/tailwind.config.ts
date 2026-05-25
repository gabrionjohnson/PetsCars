import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        green:  { DEFAULT: '#1a5c38', light: '#2d7a50', dark: '#0f3d25' },
        cream:  { DEFAULT: '#f7f3ed', dark: '#ede5d9' },
        amber:  { DEFAULT: '#d97706', light: '#fbbf24' },
      },
    },
  },
  plugins: [],
} satisfies Config
