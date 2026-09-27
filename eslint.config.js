// Lint for bugs, not style: ESLint's recommended rules plus Vue's "essential"
// set (things that break at runtime). Formatting is left to Prettier.
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: ['dist/', 'wordpress/sorcery-puzzle/dist/', 'redesign/', '.mockup/', 'cards_test/'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      // `const { a, ...rest } = obj` is how fields are stripped on purpose.
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      // Board and Hand are fine names; renaming them buys nothing.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Deliberate: the ability sub-editors are parts of one form (TriggerEditor)
    // and edit the ability object they are given in place, through v-model.
    // Editing is locked while a solution is being recorded (CardSetup), which
    // is the risk this rule would otherwise guard against.
    files: ['src/components/ConditionEditor.vue', 'src/components/EffectSelector.vue', 'src/components/TargetEditor.vue'],
    rules: { 'vue/no-mutating-props': 'off' },
  },
  {
    files: ['scripts/**', 'tests/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
