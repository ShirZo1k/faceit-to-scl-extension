/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}",
    "!./src/extension/popup.html",
    "!./src/extension/intro.html",
  ],
  prefix: "csn",
  theme: {
    extend: {
      colors: {
        scl: "#0BAEEA",
      },
      dropShadow: (theme) => ({
        glow: [`0 0 4px ${theme("colors.scl")}`],
      }),
    },
  },
  corePlugins: {
    preflight: false,
  },
};
