/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        free: {
          DEFAULT: 'rgba(25, 135, 84, 0.35)',
          hover: 'rgba(25, 135, 84, 0.5)'
        },
        taken: {
          DEFAULT: 'rgba(220, 53, 69, 0.15)',
          hover: 'rgba(220, 53, 69, 0.25)'
        }
      }
    },
  },
  plugins: [],
}
