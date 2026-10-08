import { createHash } from 'node:crypto';
import { AppError } from '../../domain/errors/AppError';
import { requireAiEnabled } from './aiCapabilities';
const guardedMethods = new Set([
  'invoke',
  'stream',
  'batch',
  'generate',
  '_generate',
  '_streamResponseChunks',
  'embedQuery',
  'embedDocuments',
]);
function configurationVersion(): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.entries(process.env)
          .filter(([key]) => /^(LLM_|AI_|OLLAMA_|OPENAI_|OPENROUTER_|CLAUDE_|ANTHROPIC_)/.test(key))
          .sort(),
      ),
    )
    .digest('hex');
}
/** Existing clients cannot continue using a disabled provider or a stale credential. */
export function guardAiClient<T extends object>(client: T): T {
  const version = configurationVersion();
  return new Proxy(client, {
    get(target, property, receiver) {
      const member: unknown = Reflect.get(target, property, receiver);
      if (typeof member !== 'function' || !guardedMethods.has(String(property))) return member;
      return (...args: unknown[]) => {
        requireAiEnabled();
        if (configurationVersion() !== version)
          throw AppError.conflict(
            'Configurazione modello aggiornata: attendi il riavvio del servizio',
            'AI_CONFIGURATION_CHANGED',
          );
        return Reflect.apply(member, receiver, args);
      };
    },
  });
}
