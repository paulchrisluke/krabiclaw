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
    files: ['server/domain/merchant-handoff/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            'nitro', 'nitro/**', 'h3', 'h3/**',
            '~/components/**', '~/pages/**', '~/server/api/**',
            '~/server/db', '~/server/db/**', '~/server/utils/**',
            '../../api/**', '../../db', '../../db/**', '../../utils/**'
          ],
          message: 'Merchant handoff domain code must stay independent of UI, transport, persistence, and framework modules.'
        }]
      }]
    }
  }
)
