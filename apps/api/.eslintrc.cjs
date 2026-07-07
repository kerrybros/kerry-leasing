// The API is a Node/Express app, not Next.js. Without this, it inherits the
// repo-root .eslintrc (next/core-web-vitals), whose Next rules error on the
// missing pages/ dir. `root: true` stops that inheritance.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist/', 'src/generated/', '**/*.cjs'],
  rules: {
    // Pragmatic baseline — keep lint useful without demanding a big cleanup pass.
    // Tighten these over time.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-constant-condition': ['error', { checkLoops: false }], // allow while(true) pagination loops
    'no-inner-declarations': 'off', // obsolete under ESM/TS
    'prefer-const': 'warn',
  },
};
