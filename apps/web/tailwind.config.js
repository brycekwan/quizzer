const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fredoka', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#1a1040',
        sun: '#ffd166',
        coral: '#ff6b6b',
        mint: '#06d6a0',
        sky: '#4cc9f0',
        grape: '#7b2cbf',
        cream: '#fff7ed',
      },
      boxShadow: {
        pop: '0 8px 0 rgba(26, 16, 64, 0.25)',
        'pop-sm': '0 4px 0 rgba(26, 16, 64, 0.2)',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        popin: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 209, 102, 0.5)' },
          '50%': { boxShadow: '0 0 0 12px rgba(255, 209, 102, 0)' },
        },
      },
      animation: {
        wiggle: 'wiggle 1.2s ease-in-out infinite',
        popin: 'popin 0.35s ease-out',
        pulseGlow: 'pulseGlow 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
