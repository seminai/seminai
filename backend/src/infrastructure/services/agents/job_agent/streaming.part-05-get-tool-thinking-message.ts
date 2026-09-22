import { asRecord, parsePossiblyJson } from './streaming.part-01-stream-event-type';

/**
 * Helper to generate thinking message for tool calls
 */
export function getToolThinkingMessage(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'list_job_paths':
      return `🔍 Sto esplorando i dati disponibili per questa operazione...`;
    case 'inspect_job_data':
      const pathName = getHumanReadablePathName(args.path as string);
      return `📖 Sto leggendo ${pathName}...`;
    case 'extract_label_data':
      const productName = (args.productName as string) || 'il prodotto';
      return `🏷️ Sto analizzando l'etichetta del prodotto ${productName}...`;
    case 'tavily_search':
      const query = (args.query as string) || '';
      const shortQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;
      return `🌐 Sto cercando informazioni su: ${shortQuery}...`;
    case 'search_disciplinari':
      const prodName = (args.productName as string) || 'il prodotto';
      return `📚 Sto verificando i disciplinari di produzione integrata per ${prodName}...`;
    case 'vector_search_documents':
      const searchQuery = (args.query as string) || '';
      const shortSearchQuery =
        searchQuery.length > 50 ? searchQuery.substring(0, 50) + '...' : searchQuery;
      return `🔎 Sto cercando nei documenti: ${shortSearchQuery}...`;
    case 'bdf_search_product_doses':
      const bdfProd = (args.productName as string) || 'il prodotto';
      return `🔍 Sto cercando le dosi ufficiali di ${bdfProd} nella Banca Dati Fitofarmaci...`;
    case 'bdf_search_products_by_adversity':
      const bdfCrop = (args.cropName as string) || 'la coltura';
      const bdfAdv = (args.adversityName as string) || "l'avversità";
      return `🔍 Sto cercando i prodotti autorizzati per ${bdfAdv} su ${bdfCrop} nella BDF...`;
    case 'propose_job_modification':
      const fieldName = getHumanReadableFieldName(args.field as string);
      return `✏️ Sto preparando una proposta di modifica per ${fieldName}...`;
    default:
      return `⚙️ Sto elaborando le informazioni...`;
  }
}

/**
 * Helper to convert technical path names to human-readable descriptions
 */
export function getHumanReadablePathName(path: string): string {
  const pathMap: Record<string, string> = {
    note: 'le note del trattamento',
    alertNotes: 'le informazioni di sicurezza e conformità',
    history: 'la cronologia delle decisioni',
    root: 'i dati principali',
  };
  return pathMap[path] || `i dati (${path})`;
}

/**
 * Helper to convert technical field names to human-readable descriptions
 */
export function getHumanReadableFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    quantity: 'la quantità',
    dateOfOpeation: 'la data di operazione',
    note: 'le note',
    treatedSurface: 'la superficie trattata',
    modeOfApplication: 'la modalità di applicazione',
  };
  return fieldMap[field] || field;
}

/**
 * Helper to generate a user-friendly summary of reasoning messages
 */
export function getReasoningSummary(reasoning: string): string {
  // If reasoning is very technical, provide a simpler summary
  if (reasoning.includes('job') && reasoning.includes('analisi')) {
    return 'Sto analizzando le informazioni raccolte...';
  }
  if (reasoning.includes('fonti') || reasoning.includes('sources')) {
    return 'Sto consultando le fonti di informazioni...';
  }
  if (reasoning.includes('completata') || reasoning.includes('completato')) {
    return 'Analisi completata';
  }
  // For other cases, try to extract a simple summary
  const shortReasoning = reasoning.length > 80 ? reasoning.substring(0, 80) + '...' : reasoning;
  return shortReasoning;
}

/**
 * Helper to generate human-readable task status messages
 */
export function getTaskStatusMessage(status: string, description: string): string {
  const statusMap: Record<string, string> = {
    pending: 'in attesa',
    in_progress: 'in corso',
    completed: 'completato',
    cancelled: 'annullato',
  };
  const statusText = statusMap[status] || status;

  // Make description more user-friendly by removing technical terms
  const friendlyDescription = description
    .replace(/list_job_paths/gi, 'esplorazione dati')
    .replace(/inspect_job_data/gi, 'lettura informazioni')
    .replace(/tavily_search/gi, 'ricerca web')
    .replace(/search_disciplinari/gi, 'verifica disciplinari')
    .replace(/Usa /g, '')
    .replace(/per /g, '');

  return `${friendlyDescription} - ${statusText}`;
}

/**
 * Helper to generate summary for tool results
 */
export function getToolResultSummary(toolName: string, content: string): string {
  try {
    if (toolName === 'list_job_paths') {
      const parsedRecord = asRecord(JSON.parse(content));
      if (!parsedRecord) return content.length > 100 ? content.substring(0, 100) + '...' : content;
      const summary = asRecord(parsedRecord.summary);
      const totalPaths = typeof summary?.totalPaths === 'number' ? summary.totalPaths : 0;
      if (totalPaths === 0) {
        return 'Nessun dato trovato';
      }
      return `Trovate ${totalPaths} sezioni di informazioni disponibili`;
    }
    if (toolName === 'inspect_job_data') {
      const parsedRecord = asRecord(JSON.parse(content));
      if (!parsedRecord) return content.length > 100 ? content.substring(0, 100) + '...' : content;
      if (parsedRecord.type === 'array') {
        const count = typeof parsedRecord.length === 'number' ? parsedRecord.length : 0;
        return `Trovati ${count} elementi`;
      }
      if (parsedRecord.type === 'object') {
        const keysRaw = parsedRecord.keys;
        const keys = Array.isArray(keysRaw) ? keysRaw : [];
        if (keys.length === 0) {
          return 'Dati letti correttamente';
        }
        return `Informazioni lette correttamente (${keys.length} campi disponibili)`;
      }
      const value = String(parsedRecord.value || '');
      if (value.length > 100) {
        return value.substring(0, 100) + '...';
      }
      return value || 'Dati letti correttamente';
    }
    if (toolName === 'tavily_search') {
      return 'Ricerca completata con successo';
    }
    if (toolName === 'search_disciplinari') {
      if (content.includes('No disciplinari')) {
        return 'Nessun disciplinare trovato per questo prodotto';
      }
      return 'Disciplinari trovati e analizzati';
    }
    if (toolName === 'extract_label_data') {
      return "Dati dell'etichetta estratti correttamente";
    }
    if (toolName === 'bdf_search_product_doses') {
      const parsedRecord = asRecord(parsePossiblyJson(content));
      if (parsedRecord?.error) {
        const errorText = String(parsedRecord.error);
        if (errorText.includes('doses.map is not a function')) {
          return 'Formato risposta BDF inatteso: continuo con fallback.';
        }
        return 'BDF non disponibile - uso fonti alternative';
      }
      return 'Dosi ufficiali trovate nella Banca Dati Fitofarmaci';
    }
    if (toolName === 'bdf_search_products_by_adversity') {
      const parsedRecord = asRecord(parsePossiblyJson(content));
      if (parsedRecord?.error) {
        return 'BDF non disponibile - uso fonti alternative';
      }
      return 'Prodotti autorizzati trovati nella Banca Dati Fitofarmaci';
    }
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  } catch {
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }
}
