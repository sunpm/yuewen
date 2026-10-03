import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/*.d.ts',
      '.netlify/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: ts.parser },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
    },
  },
  {
    files: ['web/src/**/*.vue', 'web-mobile/src/**/*.vue'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'ref',
          'computed',
          'watch',
          'watchEffect',
          'onMounted',
          'onUnmounted',
          'nextTick',
          'useRoute',
          'useRouter',
          'defineAsyncComponent',
          'shallowRef',
        ].map((k) => [k, 'readonly']),
      ),
    },
  },
)
