import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceBuildComplianceQueries(this: RulesRagServiceContext, params: {
    productName: string;
    activeIngredient: string;
    dose: number;
    doseUnit: string;
    applicationDate: Date;
    cropName: string;
    maxApplications?: number;
  }): Array<{ query: string; type: string }> {
    const month = params.applicationDate.toLocaleDateString('it-IT', { month: 'long' });
    return [
      // Primary query: Substance group intervention limits (most relevant for disciplinari)
      {
        query:
          `${params.activeIngredient} numero massimo interventi anno ` +
          `${params.cropName} vincolo gruppo sostanze attive disciplinare`,
        type: 'group_limit',
      },
      // Query for individual substance limits
      {
        query:
          `${params.activeIngredient} ${params.cropName} limitazioni uso note ` +
          `sostanza attiva interventi massimo`,
        type: 'substance_limit',
      },
      // Max applications query
      {
        query:
          `Numero massimo applicazioni trattamenti ${params.activeIngredient} ` +
          `${params.cropName} per anno per ciclo colturale`,
        type: 'max_applications',
      },
      // Timing/epoch query
      {
        query:
          `Epoca di impiego periodo applicazione ${params.activeIngredient} ` +
          `${params.cropName} ${month} calendario trattamenti`,
        type: 'timing',
      },
      // Authorization query
      {
        query:
          `${params.productName} ${params.activeIngredient} sostanza attiva ` +
          `autorizzata vietata ${params.cropName} limitazioni uso`,
        type: 'authorization',
      },
      // Interactions query
      {
        query:
          `interventi tra ${params.activeIngredient} gruppo sostanze attive ` +
          `${params.cropName} vincolo condiviso`,
        type: 'interactions',
      },
    ];
  }
