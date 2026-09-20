import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 相对路径 base：兼容 GitHub Pages 子路径部署（https://<user>.github.io/<repo>/）与任意子目录托管
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: '魔力魔方',
        short_name: '魔力魔方',
        description: '面向 5-12 岁儿童的魔方学习应用：3D 玩转、八种解法、课程教学、拍照识别、计时挑战',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: '#FF8A3D',
        background_color: '#FFF9EE',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wav}'],
        navigateFallback: 'index.html',
        runtimeCaching: []
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1600
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    testTimeout: 300000
  }
});
