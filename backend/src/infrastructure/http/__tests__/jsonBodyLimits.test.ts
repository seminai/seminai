import express from 'express';
import { applyLargeJsonBodyParsers, LARGE_JSON_ROUTES } from '../jsonBodyLimits';

describe('applyLargeJsonBodyParsers', () => {
  it('covers bulk and verification routes on the /api prefix as well', () => {
    expect(LARGE_JSON_ROUTES.map((route) => route.path)).toEqual([
      '/job-verification-agent',
      '/fields/bulk',
      '/production-units/bulk',
      '/onboarding',
    ]);
    expect(() => applyLargeJsonBodyParsers(express())).not.toThrow();
  });
});
