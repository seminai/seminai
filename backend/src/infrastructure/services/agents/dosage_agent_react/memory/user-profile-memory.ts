import { AgentMemoryService } from './agent-memory.service';
import { extractProfessionalContext } from './user-profile-fact-extractor';

const PROFESSIONAL_CONTEXT_KEY = 'professional_context';

/**
 * Persists stable profile facts explicitly stated in a user chat message.
 */
export async function persistUserProfileFacts(userId: string, message: string): Promise<void> {
  const professionalContext = extractProfessionalContext(message);
  if (!professionalContext) return;
  const memoryService = new AgentMemoryService();
  await memoryService.saveCoreMemory(userId, PROFESSIONAL_CONTEXT_KEY, {
    value: professionalContext,
    source: 'chat_message',
  });
}
