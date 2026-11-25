/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17202e',
        muted: '#667085',
        paper: '#f6f2e8',
        parchment: '#ece5d5',
        line: '#d8cfbd',
        teal: {
          50: '#edf8f6',
          100: '#d5efeb',
          600: '#0d746b',
          700: '#0a5d56',
          800: '#084a45',
        },
        evidence: '#2457c5',
        model: '#6d3bbf',
        web: '#b45309',
      },
      fontFamily: {
        sans: ['"Aptos"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 32, 46, 0.05), 0 10px 28px -18px rgba(23, 32, 46, 0.35)',
        float: '0 20px 55px -20px rgba(23, 32, 46, 0.4)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 180ms ease-out both',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
