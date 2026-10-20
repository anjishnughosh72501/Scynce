/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        extMidnight: '#090d16',
        extSurface: '#121826',
        extBorder: '#232d42',
        extViolet: '#8b5cf6',
        extTeal: '#14b8a6',
      },
    },
  },
  plugins: [],
};
