const base = require('./jest.integration.config.cjs');
const { LLM, toTestMatch } = require('./scripts/test-buckets.cjs');

module.exports = {
  ...base,
  testMatch: toTestMatch(LLM),
  testTimeout: 600000,
};
