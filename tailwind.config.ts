import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta analógica anos 80
        paper: "#e9dcc3",      // papelão / creme envelhecido
        "paper-dark": "#d8c7a6",
        ink: "#2b2118",        // tinta marrom-escura
        rust: "#b5471f",       // laranja queimado
        mustard: "#c98a1a",    // mostarda
        teal: "#2f6b6b",       // verde-azulado desbotado
        cassette: "#1c1712",   // plástico da fita
        "cassette-2": "#322a20",
        tape: "#5a3a22",       // marrom da fita magnética
      },
      fontFamily: {
        typewriter: ["var(--font-typewriter)", "monospace"],
        marker: ["var(--font-marker)", "cursive"],
      },
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "reel-slow": "spin 3s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
