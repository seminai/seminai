import { HumanMessage } from '@langchain/core/messages';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, StateAnnotation } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';

export function createGenerateAnswerNode(
  this: JobVerificationGraphFactoryContext
) {

  /**
   * Reasoning and answer generation node.
   */
  const generateAnswerNode = async (
    state: typeof StateAnnotation.State,
  ): Promise<Partial<typeof StateAnnotation.State>> => {
    const { messages, sources, jobs } = state;

    // Find original user question for context
    const userMessages = messages.filter((m) => m instanceof HumanMessage);
    const originalQuestion = userMessages.length > 0 ? userMessages[0].content.toString() : '';

    // Build job context with human-readable names
    const jobContext = jobs
      .map((j) => {
        const productNames = j.products?.map((p) => p.name).join(', ') || 'N/A';
        return `- ${productNames} (Azienda: ${j.company?.name || 'N/A'}, Unità: ${j.productionUnit?.name || 'N/A'}, Coltura: ${j.productionUnit?.cropName || 'N/A'})`;
      })
      .join('\n');

    const answerPrompt = new HumanMessage(
      `Genera una risposta finale basata su tutto il lavoro svolto.

DOMANDA ORIGINALE DELL'UTENTE: "${originalQuestion}"

JOB ANALIZZATI (usa questi nomi nella risposta, MAI gli ID):
${jobContext}

REGOLE:
1. Rispondi DIRETTAMENTE alla domanda dell'utente
2. Sii conciso ma completo
3. Se hai usato fonti esterne (tavily_search, search_disciplinari), CITA LE FONTI con URL
4. Se hai proposto modifiche, ricorda all'utente che deve approvarle
5. Mostra i dati che supportano la risposta

⚠️ FORMATO OBBLIGATORIO:
- NON usare MAI gli ID tecnici (come "ad5685e3-0bd6-4017...")
- USA SEMPRE: nome prodotto, azienda, unità produttiva
- Per ogni operazione indica: dose (L/ha), quantità totale, stadio BBCH, principio attivo
- Spiega le motivazioni TECNICHE agronomiche in modo chiaro

🔴 SE LA DOMANDA RIGUARDA CONFORMITÀ/DISCIPLINARI:
DEVI indicare SPECIFICAMENTE:
1. **Esito**: ✅ CONFORME o ❌ NON CONFORME
2. **Tabella comparativa**: confronto tra valori applicati e limiti del disciplinare
3. **Motivo**: se non conforme, quale parametro viola il disciplinare (dose, n. interventi, intervallo, epoca, coltura, principio attivo)
4. **Valori specifici**: es. "Dose 3.75 L/ha vs limite 3.50-4.00 L/ha", "5° intervento vs max 4 consentiti"
5. **Fonte**: nome disciplinare e anno (es. "Disciplinare Piemonte 2025")

NON LIMITARTI A DIRE "non conforme" - SPIEGA SEMPRE IL PERCHÉ con i numeri specifici!

IMPORTANTE: Se la domanda riguardava conformità/disciplinari e HAI cercato con tavily_search, includi le fonti trovate nella risposta.

Formatta la risposta in modo chiaro e professionale.`,
    );

    const answerUsageAccumulator = new UsageAccumulator();
    const answerUsageCollector = new LangChainUsageCollector(answerUsageAccumulator);
    const response = await this.model.invoke([...messages, answerPrompt], {
      callbacks: [answerUsageCollector],
    });

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(answerUsageAccumulator, {
        userId: this.userId,
        jobType: LlmJobType.JOB_VERIFICATION,
        model: this.modelName,
        metadata: { step: 'job-verification-generate-answer' },
      })
      .catch((err) => console.warn('[JOB-VERIFICATION-AGENT] Failed to log usage:', err));

    const content = response.content.toString();

    return {
      messages: [response],
      finalAnswer: content,
      reasoning: `Analisi completata per ${jobs.length} job. Fonti consultate: ${sources.length}`,
    };
  };
  return generateAnswerNode;
}
