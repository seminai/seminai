const base = require('./jest.integration.config.cjs');
const { FAST, toTestMatch } = require('./scripts/test-buckets.cjs');

module.exports = {
  ...base,
  testMatch: toTestMatch(FAST),
};
