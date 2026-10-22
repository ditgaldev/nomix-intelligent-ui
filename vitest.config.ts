import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), vue()],
  resolve: { alias: {
    '@nomix/intelligent-ui-core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    '@nomix/intelligent-ui-react/display': fileURLToPath(new URL('./packages/react/src/display.tsx', import.meta.url)),
    '@nomix/intelligent-ui-vue/display': fileURLToPath(new URL('./packages/vue/src/display.ts', import.meta.url)),
    '@nomix/intelligent-ui-react': fileURLToPath(new URL('./packages/react/src/index.tsx', import.meta.url)),
    '@nomix/intelligent-ui-vue': fileURLToPath(new URL('./packages/vue/src/index.ts', import.meta.url)),
  } },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'happy-dom', restoreMocks: true },
});
