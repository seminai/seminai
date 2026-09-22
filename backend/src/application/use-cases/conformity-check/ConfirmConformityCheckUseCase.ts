import { confirmConformityProposals } from '../../../infrastructure/queue/ConformityCheckerQueue';
import {
  ConfirmConformityCheckInput,
  ConfirmConformityCheckOutput,
} from '../../../infrastructure/services/agents/conformity_checker_agent/types';

/**
 * Use case per confermare e applicare le proposte di conformità
 */
export class ConfirmConformityCheckUseCase {
  async execute(input: ConfirmConformityCheckInput): Promise<ConfirmConformityCheckOutput> {
    return confirmConformityProposals(input);
  }
}
