import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)), formats: ['es'], fileName: 'index' },
    rollupOptions: { external: [/^vue(?:\/|$)/, /^@nomix\//, /^@json-render\//, /^reka-ui(?:\/|$)/, /^@vueuse\//, /^@lucide\//, 'clsx', 'tailwind-merge', 'class-variance-authority'] },
  },
});
