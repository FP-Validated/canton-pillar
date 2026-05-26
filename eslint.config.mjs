// ESLint 9 flat config. Phase 0 baseline. Workspaces extend this.
// NOTE: root package.json is reserved by T1 and devDependencies currently focus on
// Prettier and commitlint. Add eslint and typescript-eslint to root devDependencies
// when ESLint integration is enabled with the first TypeScript workspace in P2.
// For P0 this config exists for convention only and is not invoked by make lint;
// make lint only runs Prettier.
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.turbo/**',
      '.gradle/**',
      'target/**',
      'out/**',
      '.daml/**',
      'packages/api-contracts/dist/**',
      'packages/ledger-types/generated/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
