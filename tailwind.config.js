/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    extend: {
      colors: {
        'white': '#fff',
        'black': '#000',
        'grey-600': 'rgba(0, 0, 0, 0.30)',
      },
      fontFamily: {
        'poppins': ['"Poppins", sans-serif']
      },
      screens: {
        'xs': '375px',
        // => @media (min-width: 320px) { ... }

        'sm': '576px',
        // => @media (min-width: 575px) { ... }

        'md': '768px',
        // => @media (min-width: 768px) { ... }

        'lg': '992px',
        // => @media (min-width: 992px) { ... }

        'xl': '1200px',
        // => @media (min-width: 1200px) { ... }

        '2xl': '1366px',
        // => @media (min-width: 1440px) { ... }

        '3xl': '1600px',
        // => @media (min-width: 1600px) { ... }
      },
      colors: {
        'orange-600': '#FB553C',
      },
    },
  },
  plugins: [],
}

