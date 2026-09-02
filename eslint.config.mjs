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
      '.worktrees/**',
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
  },
  {
    files: ['components/dashboard/Editor*.vue'],
    rules: {
      'no-restricted-globals': ['error', {
        name: 'useDashboardApi',
        message: 'Shared editor UI emits intent. The workspace owner calls useDashboardApi.'
      }],
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['~/lib/components/workspace/**', '~/server/**', '#server/**'],
          message: 'Shared editor UI cannot depend on workspace owners or server modules.'
        }]
      }]
    }
  }
)
