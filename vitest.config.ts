import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@scenesync/shared-types': path.resolve(__dirname, './packages/shared-types/src'),
      '@scenesync/spoiler-policy': path.resolve(__dirname, './packages/spoiler-policy/src'),
      '@scenesync/ai': path.resolve(__dirname, './services/ai/src'),
      '@scenesync/extension': path.resolve(__dirname, './apps/extension/src'),
    },
  },
});
