import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://gateway:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: configDefaults.exclude,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
