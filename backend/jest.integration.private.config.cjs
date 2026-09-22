const base = require('./jest.integration.config.cjs');

module.exports = {
  ...base,
  testMatch: ['**/integration-test/private-fixtures.integration.test.ts'],
};
