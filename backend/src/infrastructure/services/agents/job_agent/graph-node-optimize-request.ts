import { SystemMessage } from '@langchain/core/messages';
import { StateAnnotation, SYSTEM_PROMPT } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';

export function createOptimizeRequestNode(
  this: JobVerificationGraphFactoryContext
) {

  // We'll create dynamic tools (inspect_job_data, list_job_paths) in the agent node
  // since they need access to the jobs from state

  // 2. Define Nodes

  /**
   * Request optimizer node.
   * Analyzes and optimizes the user's request.
   * Passes full job data context for inspection.
   */
  const optimizeRequestNode = async (
    state: typeof StateAnnotation.State,
  ): Promise<Partial<typeof StateAnnotation.State>> => {
    const { messages, jobs } = state;

    // Create a summary for quick reference but tell agent to use tools for details
    const jobsSummary = jobs.map((j) => ({
      id: j.job.id,
      date: j.job.dateOfOpeation,
      category: j.job.category,
      quantity: `${j.job.quantity} ${j.job.unitOfMeasureQuantity}`,
      productionUnit: j.productionUnit.name,
      crop: `${j.productionUnit.cropName} (${j.productionUnit.cropType})`,
      products: j.products.map((p) => `${p.name} (${p.registrationNumber || 'N/A'})`),
      isVerified: j.job.isVerified,
      conformityChecked: j.job.conformityChecked,
      // Indicate what nested data is available
      hasAlertNotes: !!j.job.alertNotes,
      hasHistory: !!(j.job.history && Array.isArray(j.job.history) && j.job.history.length > 0),
      hasNote: !!j.job.note,
    }));

    const contextMessage = new SystemMessage(
      `${SYSTEM_PROMPT}

JOBS DA VERIFICARE (Summary - usa i tool per i dettagli):
${JSON.stringify(jobsSummary, null, 2)}

IMPORTANTE: Per ogni job con hasAlertNotes=true, hasHistory=true, o hasNote=true ci sono dati annidati.
USA SEMPRE i tool list_job_paths e inspect_job_data per leggere questi dati prima di rispondere!`,
    );

    // Check if system message already exists
    const hasSystemMessage = messages.some((msg) => msg instanceof SystemMessage);

    return {
      messages: hasSystemMessage ? [] : [contextMessage],
    };
  };
  return optimizeRequestNode;
}
