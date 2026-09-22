jest.mock('../../shared/modelRouter', () => ({
  createModelForTask: jest.fn((complexity: string) => ({
    model: {},
    modelName: `model-${complexity}`,
    provider: 'openrouter',
    complexity,
  })),
}));

import { DosageReactGraphFactory } from '../graph/DosageReactGraph';
import { createModelForTask } from '../../shared/modelRouter';

describe('DosageReactGraphFactory model routing', () => {
  it('creates low, medium, and high models through modelRouter by default', () => {
    new DosageReactGraphFactory({ threadId: 'thread-model-router' });

    expect(createModelForTask).toHaveBeenCalledTimes(3);
    expect(createModelForTask).toHaveBeenNthCalledWith(
      1,
      'low',
      expect.objectContaining({ preferredProvider: undefined }),
    );
    expect(createModelForTask).toHaveBeenNthCalledWith(
      2,
      'medium',
      expect.objectContaining({ preferredProvider: undefined }),
    );
    expect(createModelForTask).toHaveBeenNthCalledWith(
      3,
      'high',
      expect.objectContaining({ preferredProvider: undefined }),
    );
  });
});
