import axios from 'axios';
import { AudioToTextError } from './audio-to-text-error';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceHandleTranscriptionError(this: AudioToTextServiceContext, error: unknown): AudioToTextError {
    if (error instanceof AudioToTextError) {
      return error;
    }

    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const responseData = error.response.data as
        | { error?: { message?: string }; message?: string }
        | undefined;
      const message =
        responseData?.error?.message || responseData?.message || 'Errore durante la trascrizione';
      const cause = error instanceof Error ? error : undefined;

      switch (status) {
        case 400:
          return new AudioToTextError(`Richiesta non valida: ${message}`, cause);
        case 401:
          return new AudioToTextError('API key non valida o mancante', cause);
        case 402:
          return new AudioToTextError('Credito OpenRouter insufficiente', cause);
        case 403:
          return new AudioToTextError('Accesso negato dal provider OpenRouter', cause);
        case 413:
          return new AudioToTextError('File audio troppo grande', cause);
        case 429:
          return new AudioToTextError('Limite di rate raggiunto, riprova più tardi', cause);
        case 500:
          return new AudioToTextError('Errore interno del provider OpenRouter', cause);
        default:
          return new AudioToTextError(`Errore HTTP ${status}: ${message}`, cause);
      }
    }

    if (axios.isAxiosError(error)) {
      if (error.code === 'ENOTFOUND') {
        return new AudioToTextError("Errore di connessione all'API OpenRouter", error);
      }
      if (error.code === 'ECONNABORTED') {
        return new AudioToTextError('Timeout durante la trascrizione', error);
      }
    }

    const fallback = error instanceof Error ? error : new Error(String(error));
    return new AudioToTextError(`Errore sconosciuto: ${fallback.message}`, fallback);
  }
