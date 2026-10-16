/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'void-black': '#0B0C10',
        'hollow-slate': '#161922',
        'panel-border': '#2A2F3D',
        'fairy-cyan': '#00F0FF',
        'phaethon-gold': '#FFE600',
        'ether-crimson': '#FF2A54',
        'signal-lime': '#B8FF01',
      },
      fontFamily: {
        'display': ['"Chakra Petch"', '"Rajdhani"', '"Arial Narrow"', 'sans-serif'],
        'sans': ['"Inter"', 'system-ui', 'sans-serif'],
        'mono': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'spin-fast': 'spin 1.2s linear infinite',
        'pulse-cyan': 'pulseCyan 2.5s ease-in-out infinite',
        'glitch': 'glitch 0.4s ease-in-out infinite',
      },
      keyframes: {
        pulseCyan: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.65', transform: 'scale(0.95)' },
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '25%': { transform: 'translate(-2px, 1px)' },
          '50%': { transform: 'translate(2px, -1px)' },
          '75%': { transform: 'translate(-1px, -1px)' },
        }
      }
    },
  },
  plugins: [],
};
