/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#0d1117',
        surface: '#161b22',
        surfaceBorder: '#30363d',
        accentViolet: '#8b5cf6',
        accentTeal: '#14b8a6',
      },
    },
  },
  plugins: [],
};
