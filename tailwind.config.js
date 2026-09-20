/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        brand: '#FF8A3D',
        'brand-deep': '#F76707',
        cream: '#FFF9EE',
        ink: '#2D3748',
        subtle: '#5A6472',
        faint: '#8A94A6'
      },
      boxShadow: {
        card: '0 6px 0 rgba(61, 58, 55, 0.08)',
        'card-lg': '0 10px 0 rgba(61, 58, 55, 0.10)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};
