/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ide-bg': '#1e1e2e',
        'ide-sidebar': '#181825',
        'ide-panel': '#11111b',
        'ide-border': '#313244',
        'ide-text': '#cdd6f4',
        'ide-text-dim': '#6c7086',
        'ide-accent': '#89b4fa',
        'ide-accent-2': '#a6e3a1',
        'ide-warning': '#f9e2af',
        'ide-error': '#f38ba8',
        'ide-success': '#a6e3a1',
        'ide-user-msg': '#1e293b',
        'ide-assistant-msg': '#1a1a2e',
      },
    },
  },
  plugins: [],
};
