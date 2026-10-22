/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tabby: {
          green: '#6CFF93',
          greenHover: '#5FE683',
          greenDark: '#0A8A36',
          black: '#1A1919',
          darkHover: '#2E2D2D',
          cloud: '#F5F4F2',
          surface: '#FFFFFF',
          border: '#E8E6E1',
          borderLight: '#F0EEE9',
          muted: '#71706E',
          subtle: '#9E9D9A'
        },
        slate: {
          850: '#151f32',
          900: '#0f172a',
          950: '#080d1a',
        },
        badge: {
          brilliant: '#06b6d4',
          great: '#3b82f6',
          best: '#10b981',
          excellent: '#34d399',
          good: '#a3e635',
          book: '#d97706',
          inaccuracy: '#f59e0b',
          mistake: '#f97316',
          blunder: '#ef4444',
          missed: '#dc2626',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Outfit', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', '"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px'
      },
      boxShadow: {
        'tabby': '0 4px 20px -2px rgba(26, 25, 25, 0.06)',
        'tabby-lg': '0 12px 32px -4px rgba(26, 25, 25, 0.1)'
      }
    },
  },
  plugins: [],
}
