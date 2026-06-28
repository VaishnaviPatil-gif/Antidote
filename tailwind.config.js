/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      maxWidth: {
        // The shared mobile frame width used across every screen.
        "frame": "430px",
      },
    },
  },
  plugins: [],
};
