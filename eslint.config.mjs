import withNuxt from '@nuxt/eslint-config'

export default withNuxt(
  {
    ignores: [
      '.agents/**',
      '**/.agents/**',
      '.agents/skills/**',
      '**/.agents/skills/**',
      '.data/**',
      '.tmp/**',
      '.nuxt/**',
      '.output/**',
      '.wrangler/**',
      'dist/**'
    ]
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'import/first': 'off',
      'no-empty': 'error',
      'no-useless-escape': 'off',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'nuxt/prefer-import-meta': 'off',
      'prefer-const': 'error',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-self-closing': 'off',
      'vue/no-multiple-template-root': 'off',
      'vue/no-template-shadow': 'off',
      'vue/no-v-html': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'vue/require-default-prop': 'off'
    }
  }
)
