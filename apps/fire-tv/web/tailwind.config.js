/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tvMidnight: '#090d16',
        tvSurface: '#121826',
        tvSurfaceHover: '#1c2438',
        tvBorder: '#232d42',
        tvAccentViolet: '#9333ea',
        tvAccentCyan: '#06b6d4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
