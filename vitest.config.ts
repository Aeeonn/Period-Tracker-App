import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**/*.spec.ts'],
    passWithNoTests: true,
    restoreMocks: true,
    clearMocks: true,
  },
});
