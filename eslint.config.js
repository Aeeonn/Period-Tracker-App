import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.toolchain-scratch/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Render untrusted text without HTML injection.' },
        { property: 'outerHTML', message: 'Render untrusted text without HTML injection.' },
        { property: 'geolocation', message: 'Location access is outside the approved app scope.' },
      ],
    },
  },
);
