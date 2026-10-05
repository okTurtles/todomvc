import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default [
  {
    ignores: [
      'dist/', 'build/', 'contracts/', 'node_modules/',
      // Playwright output, gitignored but still linted otherwise.
      'playwright-report/', 'test-results/'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    // The TypeScript inside each component's <script setup> needs the
    // TypeScript parser, which the Vue parser hands it to.
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } }
  },
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        window: 'readonly'
      }
    },
    rules: {
      // The TypeScript version of the rule, since the plain one misreads types.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true
      }],
      'vue/multi-word-component-names': 'off',
      // These two only enforce where line breaks go inside a template.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off'
    }
  },
  {
    // Contracts run in Chelonia's sandbox, which provides `sbp` and a
    // `require` limited to the modules the app passes in. They stay
    // JavaScript: chel signs the file as it is and Chelonia runs that same
    // text, so nothing in between could strip types out.
    files: ['src/contracts/*.js'],
    languageOptions: { globals: { sbp: 'readonly', require: 'readonly' } },
    // That `require` is the sandbox's, not a CommonJS import.
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
]
