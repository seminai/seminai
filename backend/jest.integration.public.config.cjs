const base = require('./jest.integration.config.cjs');
const { PUBLIC, toTestMatch } = require('./scripts/test-buckets.cjs');

module.exports = {
  ...base,
  testMatch: toTestMatch(PUBLIC),
};
