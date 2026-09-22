module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/src/test/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/seminai-mcp/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false, tsconfig: 'tsconfig.json' }],
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    // Use the tracked bridge because the generated Prisma tree is recreated and
    // intentionally never versioned.
    '^@prisma/client$': '<rootDir>/src/integration-test/prisma-jest-bridge.ts',
    'query_compiler_fast_bg\\.postgresql\\.mjs$':
      '@prisma/client/runtime/query_compiler_fast_bg.postgresql.js',
    'query_compiler_fast_bg\\.postgresql\\.wasm-base64\\.mjs$':
      '@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js',
  },
  transformIgnorePatterns: ['/node_modules/(?!(@langchain|ansi-styles|chalk)/)'],
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
};
