import { useMutation } from '@tanstack/react-query';
import { postAudioToTextTranscribe } from '@/generated/api/audio-to-text/audio-to-text';

interface TranscribeAudioCallbacks {
  readonly onText: (text: string) => void;
  readonly onEmpty: () => void;
  readonly onError: () => void;
}

export function useTranscribeAudio(callbacks: TranscribeAudioCallbacks) {
  return useMutation({
    mutationFn: async (file: File) => {
      const response = await postAudioToTextTranscribe({
        file,
        postProcess: 'true',
        responseFormat: 'verbose_json',
      });
      if (response.status !== 200 || !response.data || typeof response.data !== 'object') return '';
      const data = response.data as { data?: { text?: string } };
      return data.data?.text?.trim() ?? '';
    },
    onSuccess: (transcribedText) => {
      if (!transcribedText) {
        callbacks.onEmpty();
        return;
      }
      callbacks.onText(transcribedText);
    },
    onError: callbacks.onError,
  });
}
