module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Privacy boundary for the fertilizer plan feature: tool layer must consume only
      // the sanitized public output via the use case. Importing the loaders, optimizer,
      // or the private result type from the agent tools is forbidden.
      files: [
        'src/infrastructure/services/agents/**/*.ts',
        'src/infrastructure/services/agents/**/*.tsx',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/services/fertilizer/**'],
                message:
                  'Tool/agent layer must not import fertilizer infrastructure directly. Use ComputeFertilizerPlanUseCase instead.',
              },
              {
                group: ['**/domain/entities/fertilizer-plan/plan-sanitizer'],
                message: 'Sanitizer must be invoked from the application layer only.',
              },
            ],
          },
        ],
      },
    },
  ],
};
