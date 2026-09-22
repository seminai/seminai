jest.mock('../../../llm-vision-client', () => ({
  buildImageContentPart: jest.fn((b64: string, mime: string) => ({
    type: 'image_url',
    image_url: { url: `data:${mime};base64,${b64}` },
  })),
  fetchVisionCompletion: jest.fn(),
}));

import { createDiagnoseFromPhotoTool } from '../tools/diagnose-from-photo.tool';
import { buildImageContentPart, fetchVisionCompletion } from '../../../llm-vision-client';
import { clearWorkingMemory, getWorkingMemory, updateWorkingMemory } from '../working-memory';

const visionMock = fetchVisionCompletion as jest.Mock;
const imagePartMock = buildImageContentPart as jest.Mock;

describe('diagnose_from_photo tool', () => {
  const threadId = 'thread-diag';

  beforeEach(() => {
    jest.clearAllMocks();
    clearWorkingMemory(threadId);
  });

  afterEach(() => clearWorkingMemory(threadId));

  function attachImage(
    params: {
      readonly mimeType?: string;
      readonly fileName?: string;
      readonly buffer?: Buffer;
    } = {},
  ): void {
    updateWorkingMemory(threadId, {
      uploadedFiles: [
        {
          buffer: params.buffer ?? Buffer.from('fake-bytes'),
          mimeType: params.mimeType ?? 'image/png',
          fileName: params.fileName ?? 'leaf.png',
        },
      ],
    });
  }

  it('returns a clear unsupported status when no image is in working memory', async () => {
    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;
    expect(result.status).toBe('unsupported');
    expect(result.message).toContain('Rispondi ora');
    expect(visionMock).not.toHaveBeenCalled();
  });

  it('parses a valid diseased plant image and persists a brief diagnosis', async () => {
    attachImage();
    visionMock.mockResolvedValue({
      content: JSON.stringify({
        status: 'diagnosed',
        visibleSymptoms: ['Macchie giallastre sulla lamina'],
        possibleCauses: ['Peronospora'],
        severity: 'medium',
        recommendedActions: ['Rimuovi foglie molto colpite', 'Migliora aerazione'],
        followUpQuestions: ['La pagina inferiore presenta muffa bianca?'],
        candidates: [
          { avversita: 'Peronospora', confidence: 0.85, tipo: 'fungina' },
          { avversita: 'Oidio', confidence: 0.4, tipo: 'fungina' },
        ],
        cropGuess: 'Vite',
      }),
      model: 'gpt-4o',
    });

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({ cropContext: 'Vite' })) as Record<string, unknown>;

    expect(result.status).toBe('diagnosed');
    expect(result.candidates).toHaveLength(2);
    expect((result.candidates as Array<{ avversita: string }>)[0].avversita).toBe('Peronospora');
    expect(result.nextRequiredTool).toBeUndefined();
    expect(result.message).toContain('non chiamare recommend_best_products');
    expect(getWorkingMemory(threadId).photoDiagnosis?.status).toBe('diagnosed');
    expect(getWorkingMemory(threadId).photoDiagnosis?.recommendedActions).toContain(
      'Migliora aerazione',
    );
  });

  it('handles unclear images with follow-up questions', async () => {
    attachImage();
    visionMock.mockResolvedValue({
      content: JSON.stringify({
        status: 'unclear',
        visibleSymptoms: [],
        possibleCauses: [],
        severity: 'unknown',
        recommendedActions: ['Scatta una foto piu nitida in luce naturale'],
        followUpQuestions: ['Puoi fotografare anche la pagina inferiore della foglia?'],
        candidates: [],
        cropGuess: null,
      }),
      model: 'gpt-4o',
    });

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;

    expect(result.status).toBe('unclear');
    expect(result.followUpQuestions).toContain(
      'Puoi fotografare anche la pagina inferiore della foglia?',
    );
    expect(result.message).toContain('Rispondi ora');
    expect(result.error).toBeUndefined();
  });

  it('handles images that are not related to a plant', async () => {
    attachImage();
    visionMock.mockResolvedValue({
      content: JSON.stringify({
        status: 'not_plant',
        visibleSymptoms: [],
        possibleCauses: [],
        severity: 'unknown',
        recommendedActions: ['Invia una foto ravvicinata della pianta da controllare'],
        followUpQuestions: ['Quale pianta vuoi diagnosticare?'],
        candidates: [],
        cropGuess: null,
      }),
      model: 'gpt-4o',
    });

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;

    expect(result.status).toBe('not_plant');
    expect(result.recommendedActions).toContain(
      'Invia una foto ravvicinata della pianta da controllare',
    );
  });

  it('accepts WebP images', async () => {
    attachImage({ mimeType: 'image/webp', fileName: 'leaf.webp' });
    visionMock.mockResolvedValue({
      content: JSON.stringify({
        status: 'diagnosed',
        visibleSymptoms: ['Foglie accartocciate'],
        possibleCauses: ['Afidi'],
        severity: 'low',
        recommendedActions: ['Controlla la pagina inferiore delle foglie'],
        followUpQuestions: [],
        candidates: [{ avversita: 'Afidi', confidence: 0.7, tipo: 'insetto' }],
        cropGuess: null,
      }),
      model: 'gpt-4o',
    });

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;

    expect(result.status).toBe('diagnosed');
    expect(imagePartMock).toHaveBeenCalledWith(expect.any(String), 'image/webp', 'high');
  });

  it('does not send images larger than 15MB to the vision model', async () => {
    attachImage({ buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;

    expect(result.status).toBe('too_large');
    expect(result.notes).toContain('15 MB');
    expect(visionMock).not.toHaveBeenCalled();
    expect(getWorkingMemory(threadId).photoDiagnosis?.status).toBe('too_large');
  });

  it('returns a useful failed status when the vision response is not valid JSON', async () => {
    attachImage();
    visionMock.mockResolvedValue({ content: 'non riesco a leggere la foto', model: 'gpt-4o' });

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;

    expect(result.status).toBe('failed');
    expect(result.recommendedActions).toContain(
      'Evita trattamenti alla cieca finche i sintomi non sono piu chiari.',
    );
    expect(getWorkingMemory(threadId).photoDiagnosis?.status).toBe('failed');
  });

  it('returns a useful failed status when the vision call fails', async () => {
    attachImage();
    visionMock.mockRejectedValue(new Error('network timeout'));

    const tool = createDiagnoseFromPhotoTool(threadId);
    const result = JSON.parse(await tool.func({})) as Record<string, unknown>;

    expect(result.status).toBe('failed');
    expect(result.notes).toBe('network timeout');
    expect(result.followUpQuestions).toContain('Quale coltura e varieta e?');
  });
});
