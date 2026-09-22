import { inspectPrivateFixtures } from './fixtures/private-fixture-harness';

const describeWhenConfigured = process.env.SEMINAI_FIXTURES_DIR ? describe : describe.skip;

describeWhenConfigured('Optional local fixture boundary', () => {
  it('reads external fixtures without emitting their metadata', () => {
    const summary = inspectPrivateFixtures();
    expect(summary.configured).toBe(true);
    expect(summary.fileCount).toBeGreaterThan(0);
    expect(summary.totalBytes).toBeGreaterThan(0);
  });
});
