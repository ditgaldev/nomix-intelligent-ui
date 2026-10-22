import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: { index: fileURLToPath(new URL('./src/index.ts', import.meta.url)), display: fileURLToPath(new URL('./src/display.ts', import.meta.url)) },
      formats: ['es'], fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: { external: [/^vue(?:\/|$)/, /^@nomix\//, /^@json-render\//, /^reka-ui(?:\/|$)/, /^@vueuse\//, /^@lucide\//, 'chart.js', 'clsx', 'tailwind-merge', 'class-variance-authority'] },
  },
});
