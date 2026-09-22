import {
  AudioToTextService,
  createAudioToTextService,
  convertAudioBufferToTextWithProcessing,
} from '../infrastructure/services/agents/audio_to_text';
/**
 * Integration tests for the Audio to Text Agent.
 *
 * These tests make real calls to OpenRouter (chat/completions with audio input)
 * and the post-processing LLM (GPT-4o-mini via OpenRouter).
 *
 * Run with:
 *   npm run test:integration -- audio-to-text.integration.test.ts
 */

jest.setTimeout(120000);

/**
 * Creates a minimal valid WAV file buffer with silence (1 second, 8kHz, 16bit mono).
 * This is a real WAV that Whisper can process (it will return empty or near-empty text).
 */
function createMinimalWavBuffer(): Buffer {
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const durationSec = 1;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Data is already zero-filled (silence)

  return buffer;
}

describe('Audio to Text Agent - Integration Tests', () => {
  let service: AudioToTextService;

  beforeAll(() => {
    service = createAudioToTextService({
      language: 'it',
    });
  });

  describe('Service initialization', () => {
    it('should create a service instance with default options', () => {
      const svc = createAudioToTextService();
      expect(svc).toBeDefined();
      expect(svc).toBeInstanceOf(AudioToTextService);
    });

    it('should throw when gateway API key is missing', () => {
      const originalRouterKey = process.env.OPENROUTER_API_KEY;
      const originalOpenAiKey = process.env.OPENAI_API_KEY;
      try {
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.OPENAI_API_KEY;
        expect(() => {
          new AudioToTextService();
        }).toThrow();
      } finally {
        if (originalRouterKey !== undefined) process.env.OPENROUTER_API_KEY = originalRouterKey;
        if (originalOpenAiKey !== undefined) process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    });
  });

  describe('File validation', () => {
    it('should reject unsupported file formats', async () => {
      const fakeBuffer = Buffer.from('not an audio file');
      await expect(
        service.convertAudioToText({
          audioFile: fakeBuffer,
          fileName: 'test.txt',
        }),
      ).rejects.toThrow('Formato file non supportato');
    });

    it('should reject empty audio buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(
        service.convertAudioToText({
          audioFile: emptyBuffer,
          fileName: 'test.mp3',
        }),
      ).rejects.toThrow('Il file audio è vuoto');
    });

    it('should reject non-existent file path', async () => {
      await expect(
        service.convertAudioToText({
          audioFile: '/nonexistent/path/audio.mp3',
          fileName: 'audio.mp3',
        }),
      ).rejects.toThrow('File audio non trovato');
    });
  });

  describe('Standard prompt generation', () => {
    it('should generate Italian post-processing prompt without context', () => {
      const prompt = service.createStandardItalianPrompt();
      expect(prompt).toBeDefined();
      expect(prompt).toContain('italiano');
      expect(prompt).toContain('trascrizioni');
    });

    it('should generate Italian post-processing prompt with context', () => {
      const prompt = service.createStandardItalianPrompt('agricoltura');
      expect(prompt).toBeDefined();
      expect(prompt).toContain('agricoltura');
      expect(prompt).toContain('Contesto');
    });
  });

  describe('Real transcription via OpenRouter', () => {
    it('should transcribe a silent WAV buffer and return a result', async () => {
      const wavBuffer = createMinimalWavBuffer();

      const result = await service.convertAudioToText({
        audioFile: wavBuffer,
        fileName: 'silence.wav',
      });

      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.language).toBeDefined();
    });

    it('should transcribe and post-process a silent WAV buffer', async () => {
      const wavBuffer = createMinimalWavBuffer();
      const postProcessPrompt = service.createStandardItalianPrompt(
        'Trascrizione audio per assistente agricolo',
      );

      const result = await service.convertAudioToTextWithProcessing(
        {
          audioFile: wavBuffer,
          fileName: 'silence.wav',
        },
        postProcessPrompt,
      );

      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
    });

    it('should convert audio buffer to text with processing utility function', async () => {
      const wavBuffer = createMinimalWavBuffer();

      const text = await convertAudioBufferToTextWithProcessing(wavBuffer, 'silence.wav');

      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
    });
  });
});
