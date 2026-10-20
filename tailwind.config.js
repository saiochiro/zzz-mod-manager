/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'void-black': '#0A0608',
        'hollow-slate': '#140E12',
        'panel-border': '#2E1E26',
        'panel-card': '#191116',
        'fairy-cyan': '#FB7185', // repurposed to Chisa Rose
        'chisa-red': '#E11D48',
        'chisa-glow': '#FF2E56',
        'chisa-darkred': '#881337',
        'chisa-rose': '#FB7185',
        'chisa-gold': '#FBBF24',
        'chisa-muted': '#A1A1AA',
        'phaethon-gold': '#FBBF24',
        'ether-crimson': '#E11D48',
        'signal-lime': '#10B981', // clean calm emerald green for active state
      },
      fontFamily: {
        'display': ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', 'sans-serif'],
        'sans': ['"Inter"', 'system-ui', 'sans-serif'],
        'mono': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      animation: {
        'float-calm': 'floatCalm 4s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        floatCalm: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.82', transform: 'scale(0.98)' },
        },
      }
    },
  },
  plugins: [],
};
