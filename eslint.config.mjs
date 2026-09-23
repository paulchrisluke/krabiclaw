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
      // A catch that ends on a console call and neither throws nor returns is a
      // failure the caller is never told about. That is how a booking answered
      // 200 with the owner's email never sent, how disconnecting Google
      // Analytics reported success while the tracking script stayed live, and
      // how a Durable Object broadcast that reached nobody looked delivered.
      // There is no allowance for "transient" or "best effort": Cloudflare is not
      // the thing that fails here, our code is, and a log is not a report. If the
      // caller genuinely must continue, it has to say so in what it returns —
      // an error status, a failed result, a recorded delivery outcome — not by
      // writing the failure to a console nobody reads.
      'no-restricted-syntax': ['error', {
        selector: "CatchClause > BlockStatement[body.length=1]:not(:has(ThrowStatement)):not(:has(ReturnStatement)):has(ExpressionStatement > CallExpression[callee.object.name='console'])",
        message: 'This catch logs the failure and continues, so nothing upstream learns of it. Throw, return an error status, or record the failure somewhere a caller reads.',
      }],
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
  },
  {
    files: [
      'components/**/*.{js,mjs,ts,vue}',
      'composables/**/*.{js,mjs,ts}',
      'config/**/*.{js,mjs,ts}',
      'layouts/**/*.{js,mjs,ts,vue}',
      'lib/**/*.{js,mjs,ts}',
      'middleware/**/*.{js,mjs,ts}',
      'pages/**/*.{js,mjs,ts,vue}',
      'plugins/**/*.{js,mjs,ts}',
      'server/**/*.{js,mjs,ts}',
      'shared/**/*.{js,mjs,ts}',
      'types/**/*.{js,mjs,ts}',
      'utils/**/*.{js,mjs,ts}'
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/config/development-auth-fixtures', '**/config/development-auth-fixtures.*'],
          message: 'Development auth fixtures belong to scripts and tests; production code must use Better Auth runtime contracts.'
        }]
      }]
    }
  }
)
