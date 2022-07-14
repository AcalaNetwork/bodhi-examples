module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'plugin:react/recommended',
    'airbnb',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    'react',
    '@typescript-eslint',
  ],
  rules: {
    indent: [2, 2, { SwitchCase: 1 }],
    quotes: [2, 'single'],
    semi: [2, 'always'],
    'jsx-quotes': [2, 'prefer-single'],
    'linebreak-style': [2, 'unix'],
    'arrow-parens': [2, 'as-needed'],
    'react/jsx-curly-spacing': [2, {
      when: 'always',
      spacing: { objectLiterals: 'never' },
    }],
    'no-restricted-syntax': [
      'error',
      'ForInStatement',
      // 'ForOfStatement',
      'LabeledStatement',
      'WithStatement',
    ],
    'comma-dangle': [2, {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'never',
    }],

    /* ---------- turned off ---------- */
    'no-console': 0,
    'no-plusplus': 0,
    'max-len': 0,
    'react/jsx-filename-extension': 0,
    'react/forbid-prop-types': 0,
    'react/require-default-props': 0,
    'no-underscore-dangle': 0,
    'no-multi-spaces': 0,
    'jsx-a11y/click-events-have-key-events': 0,                             // allow click handler on <div>
    'jsx-a11y/no-static-element-interactions': 0,                           // allow click handler on <div>
    'no-unused-expressions': [2, { allowShortCircuit: true }],              // allow x && y()
    'import/no-extraneous-dependencies': [2, { devDependencies: true }],    // so can import enzyme, which is dev dependencies
    'react/jsx-props-no-spreading': 0,                                      // allow passing in props like { ...restProps }
    'import/extensions': 0,                                                 // allow passing in props like { ...restProps }
    'react-hooks/exhaustive-deps': 0,                                       // so useEffect can have empty deps
    'implicit-arrow-linebreak': 0,                                          // can use new line in long arrow function
    'react/jsx-one-expression-per-line': 0,                                 // can do <>xxx { expression }<>
    'no-nested-ternary': 0,                                                 // allow nested ternary
    'react/function-component-definition': 0,                               // don't care if using function declaration or arrow
  },
};
