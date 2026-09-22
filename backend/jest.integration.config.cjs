module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/integration-test/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/seminai-mcp/',
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  transformIgnorePatterns: [
    // Allow transforming pdf-parse (TypeScript in node_modules). Keep others ignored by default.
    '/node_modules/(?!(pdf-parse)/)',
  ],
  moduleNameMapper: {
    // Integration tests need a REAL PrismaClient (not the stub used by unit tests).
    // prisma-jest-bridge.ts bypasses generated client.ts (which uses import.meta.url)
    // and imports getPrismaClientClass directly from internal/class.ts.
    '^@prisma/client$': '<rootDir>/src/integration-test/prisma-jest-bridge.ts',
    // Redirect ESM WASM modules (.mjs) to their CJS equivalents (.js)
    // so that ts-jest's CJS require() can load them.
    'query_compiler_fast_bg\\.postgresql\\.mjs$':
      '@prisma/client/runtime/query_compiler_fast_bg.postgresql.js',
    'query_compiler_fast_bg\\.postgresql\\.wasm-base64\\.mjs$':
      '@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js',
  },
  clearMocks: true,
  collectCoverage: false,
  setupFilesAfterEnv: ['<rootDir>/src/integration-test/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1,
};
