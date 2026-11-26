import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    restoreMocks: true,
  },
});
