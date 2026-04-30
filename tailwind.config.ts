/** @type {import("tailwindcss").Config} */
const config = {
  theme: {
    extend: {
      colors: {
        surface: "#ffffff",
        "surface-muted": "#f6f7f9",
        "surface-inset": "#eef1f5",
        ink: "#18181b",
        "ink-muted": "#71717a",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(15 23 42 / 0.06), 0 8px 24px rgb(15 23 42 / 0.08)",
        panel: "0 1px 2px rgb(15 23 42 / 0.05)",
      },
      backgroundImage: {
        "app-subtle": "linear-gradient(180deg, #ffffff 0%, #f6f7f9 100%)",
      },
    },
  },
};

module.exports = config;
