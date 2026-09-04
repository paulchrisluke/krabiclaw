import withNuxt from '@nuxt/eslint-config'

export default withNuxt(
  {
    ignores: [
      '.agents/',
      '**/.agents/',
      '.data/',
      '.tmp/',
      '**/.tmp/',
      '.worktrees/',
      '.nuxt/',
      '.output/',
      '.wrangler/',
      'dist/'
    ]
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      // No varsIgnorePattern. An unused variable or import is dead code, and
      // renaming it `_thing` must not be the way to stop hearing about it: that
      // escape was hiding a live fallback that let a location edit land on the
      // wrong location. Arguments and caught errors keep the escape, because a
      // signature you do not control still has to be written out in full.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      'import/first': 'off',
      'no-empty': 'error',
      'no-useless-escape': 'off',
      // Off because @typescript-eslint/no-unused-vars above replaces it. The base
      // rule cannot read type positions, so it reports the parameter names in
      // every interface's callback signatures — names that document the contract
      // and that nothing can "use", there being no implementation. Leaving both
      // on is what put `_` prefixes on those names across the composables.
      'no-unused-vars': 'off',
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
