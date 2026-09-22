/**
 * TOOLS — Per-tool usage guidance section of the Dosage ReAct Agent system prompt.
 * Documents each tool's purpose, parameters, and preconditions for the LLM.
 */
import type { SystemPromptOptions } from './system-prompt';
import { buildSearchPriority } from './search-priority.builder';
import { buildManufacturingToolsPrompt } from './manufacturing-tools-prompt.builder';

export function buildToolsPrompt(options: SystemPromptOptions): string {
  if (options.domain === 'MANUFACTURING') {
    return buildManufacturingToolsPrompt(options);
  }

  const sections: string[] = [];

  if (options.hasContextDiscovery) {
    sections.push(`STRUMENTI DI SCOPERTA CONTESTO:

list_user_companies — Elenca le aziende associate all'utente corrente.
Non richiede parametri. Restituisce id, nome, comune, nazione e P.IVA.
Usalo quando l'utente chiede informazioni sulle sue aziende o menziona "la mia azienda".

list_production_units — Elenca le unità di produzione con colture, superfici, date e campi associati.
Parametri opzionali per azienda: companyName (nome parziale, preferito) oppure companyId (UUID da list_user_companies).
Parametro opzionale: cropName (es. "Vite", "Melo").
Salva il risultato in working memory (inputUnits). Include city e region per i disciplinari regionali.
IMPORTANTE: usa companyName se non hai l'UUID — non serve chiamare list_user_companies prima.

update_production_units — Aggiorna le date base di unità produttive esistenti.
Usalo per richieste semplici/anagrafiche come correggere startDate, endDate, floweringDate o harvestingDate.
NON usarlo per piani di trattamento: in quel caso usa generate_treatment_plan / modify_plan_step.
Richiede approvazione utente e funziona meglio dopo list_production_units.
Se devi correggere più unità produttive, fai UNA SOLA chiamata bulk con tutte le entry dentro updates.

list_company_products — Elenca i prodotti fitosanitari a magazzino con livelli di stock.
Parametri opzionali per azienda: companyName (nome parziale, preferito) oppure companyId (UUID da list_user_companies).
Salva in working memory (inputProducts). Mostra stock disponibile per ogni prodotto.

list_effective_company_rules — Elenca SOLO le regole assegnate a una company e indica se sono effettive.
Usalo quando conosci companyId prima del piano finale o di validate_compliance.
Le regole workspace non assegnate sono visibili ma NON vincolanti per il dosaggio.

search_company_stock_products — Cerca prodotti con giacenza positiva in magazzino.
Usalo per domande di inventario o per filtrare prodotti di una azienda prima di verificare autorizzazioni.

check_product_crop_authorizations — Verifica se uno o più prodotti sono autorizzati su una coltura target.
Usalo per domande come "quali prodotti posso dare su ALBICOCCO - Kioto?".
Flusso consigliato: list_company_products/search_company_stock_products → check_product_crop_authorizations con targetCrop.
NON usare search_products per semplici verifiche prodotto-coltura: search_products serve quando servono etichetta completa, dosi o workflow di pianificazione.

list_done_operations — Elenca lo storico delle operazioni gia fatte combinando Archivio verificato e note di campo.
Parametri opzionali: companyName, startDate, endDate, limit.
Usalo per "quali operazioni ho fatto", "cosa ho trattato", "trattamenti effettuati", "storico operazioni".
Presenta il risultato in due sezioni: "Operazioni verificate in Archivio" e "Operazioni da note di campo".

list_unverified_operations — Elenca le operazioni non verificate in Archivio, raggruppate per gruppo operazioni.
Parametri opzionali: companyName, limit.
Usalo SOLO quando l'utente chiede esplicitamente operazioni non verificate, da validare, pending o in attesa di verifica.
Mostra ogni gruppo separatamente e chiarisci che non sono note di campo.

ask_user_questions — Presenta domande strutturate con opzioni predefinite.
Usa DOPO list_production_units e list_company_products. Le opzioni devono basarsi su dati reali.
Tipi: single_select, multi_select, text. Dopo la chiamata, invita SOLO a selezionare le opzioni.`);
  }

  sections.push(`STRUMENTI COMPUTAZIONALI:

check_product_revoked — Verifica se un prodotto è revocato. Usa SEMPRE prima dei calcoli.
expand_production_cycles — Carica cicli produttivi con date fenologiche.
extract_buffer_zones — Estrae fasce di rispetto che riducono l'area trattabile.
search_products — Abbina prodotti a colture ed estrae le etichette ministeriali.

search_product_label_database — Cerca etichette ministeriali COMPLETE nel database interno.
Restituisce: dosi per coltura/avversità, n. max applicazioni, carenza (PHI), fasce rispetto acqua/colture,
frasi H/P, compatibilità, FRAC, composizione. Usa PRIMA di bdf_search_product_doses.
Parametri: productName (obbligatorio), registrationNumber, cropName (opzionali).

enrich_from_bdf — Arricchisce dati di dosaggio cercando prima nel database etichette, poi nella BDF.
Completa campi mancanti: n_max_applicazioni, intervallo_min_giorni, dose_min/max, epoca_impiego.

plan_treatment_strategy — Pianifica strategia cross-prodotto: ruoli, rotazione principi attivi.
calculate_dosage — Calcola date e dosi in base a fenologia, etichetta e strategia. Richiede matchedProducts.
validate_compliance — Verifica conformità con regole ACTIVE assegnate alla company. Richiede dosageResults.
Se non ci sono regole applicabili, restituisce "DA VERIFICARE", non "CONFORME".
validate_sa_group_limits — Verifica limiti per gruppo sostanze attive (es. max 12 SDHI). Richiede dosageResults.
validate_agronomic_plan — Validazione deterministica (dose>max etichetta, PHI vs raccolta, revoche): violazioni BLOCCANTI. Richiede dosageResults. Eseguire SEMPRE prima di create_treatment_jobs.
check_compatibility — Verifica compatibilità chimica tra principi attivi.
calculate_stock_balance — Calcola bilancio magazzino disponibile vs utilizzato. Richiede dosageResults.
optimize_dosage — Ottimizza dosi con programmazione lineare per rispettare vincoli di stock.
create_treatment_jobs — Crea job nel database. RICHIEDE APPROVAZIONE UTENTE.

fertilizer_plan — Genera il piano di fertilizzazione ottimale per le production unit.
Sceglie il mix di prodotti FERTILIZER (con composizione nutritiva impostata) che soddisfa la richiesta della coltura
minimizzando il totale in kg/ha. Pre-requisito: list_production_units per popolare inputUnits.
Parametri opzionali:
- productionUnitIds, fertilizerProductIds (default = tutti FERTILIZER della company);
- actualYieldByUnitId: mappa { productionUnitId: resa_t_per_ha }. PASSALA quando l'utente comunica
  la sua resa attesa per il ciclo (es. "mi aspetto 80 t/ha di pomodoro"); il piano viene scalato
  proporzionalmente. Se omesso, il piano usa la calibrazione del dataset.
- irrigation: default 1, alza solo se l'utente segnala perdite idriche significative.
Salva in working memory (fertilizerPlan).
IMPORTANTE — formato risposta: il tool restituisce un campo "markdownTable" pronto per l'utente.
Includila SEMPRE nel messaggio testuale, INVARIATA, perché contiene la tabella riepilogativa per unità + il dettaglio per settimana
(dosi per fertilizzante e Δ% N/P/K rispetto al fabbisogno). NON ricostruire la tabella né esporre richieste nutritive assolute o yield.`);

  if (options.hasPlanning) {
    sections.push(`STRUMENTI DI PIANIFICAZIONE:

generate_treatment_plan — Genera piano strutturato dai dati in working memory (richiede dosageResults).
Presenta come tabella markdown completa ed esportabile. Il campo markdownTable è pronto per l'utente:
includilo nel messaggio senza ricostruirlo. NON crea job. Salva in working memory (activePlan).

modify_plan_step — Modifica un singolo passo del piano attivo.
Parametri: stepSequence, modifications (prodotto/dose/data), reason.
Dopo la modifica il passo è "da_verificare". Suggerisci ri-validazione.

execute_treatment_plan — Esegue il piano approvato creando job nel database. RICHIEDE APPROVAZIONE UTENTE.
Parametri opzionali: stepSequences (esecuzione parziale), dryRun, queueJobId (per aggiungere a un gruppo esistente).

list_existing_job_groups — Elenca i gruppi di job di trattamento già esistenti (max 8).
Per ogni gruppo mostra: jobId, data di creazione, aziende coinvolte, numero prodotti distinti, numero job totali.
Usalo DOPO generate_treatment_plan quando l'utente vuole aggiungere il piano a un gruppo esistente senza specificare quale.
Non richiede parametri obbligatori. Il risultato include una tabella markdown pronta da presentare.

start_dosage_agent_job — Avvia il calcolo COMPLETO del piano dosaggi come job asincrono.
⚠️ RICHIEDE APPROVAZIONE UTENTE.
Legge inputProducts e inputUnits dalla working memory (da list_production_units e list_company_products).
Parametri: selectedProducts, strategy, startAt, endAt, outStockLimiter, objective, intensity, priorityTargets, agronomicNotes.
Se l'utente nomina prodotti specifici, passa selectedProducts e includi SOLO quei prodotti, non tutto il magazzino.
Restituisce un jobId per monitorare lo stato dalla dashboard.
È la modalità ACCURATA: usala per pianificare operazioni, creare proposte, salvare in archivio o fare controlli completi.
Usala anche quando la working memory contiene più aziende: calculate_dosage diretto non deve mescolare regole company.
VINCOLO: NON chiamare SENZA aver prima:
1. Raccolto le preferenze con ask_user_questions (set domande obbligatorie + estese)
2. Presentato riepilogo completo all'utente
3. Ricevuto conferma esplicita
Usa questo tool quando l'utente vuole un calcolo dosaggi COMPLETO (pipeline full con tutte le validazioni).`);
  }

  if (options.hasConformityCheck) {
    sections.push(`STRUMENTI DI VERIFICA CONFORMITÀ:

run_conformity_check — Esegue una verifica completa di conformità su un gruppo di job esistenti.
Controlla: revoca prodotti, autorizzazione coltura, dose min/max etichetta,
N-max applicazioni, compatibilità principi attivi, fasce di rispetto,
conformità disciplinare (RAG), limiti gruppi SA.
Parametri: jobGroupId (obbligatorio), notes (opzionale), skipRulesCompliance (opzionale).
Produce proposte di correzione. Usare PRIMA di confirm_conformity_check.
⚠️ Operazione costosa (RAG + BDF + LLM), timeout 5 minuti.

confirm_conformity_check — Applica le proposte di correzione accettate al database.
Parametri: jobIds (opzionale — subset di job da confermare, vuoto = tutti).
Prerequisito: run_conformity_check eseguito nella stessa sessione.
⚠️ RICHIEDE APPROVAZIONE UTENTE. Presenta il riepilogo delle proposte prima di chiamare.`);
  }

  if (options.hasJobManagement) {
    sections.push(`STRUMENTI DI GESTIONE JOB:

update_job — Modifica un job esistente (quantità, data, avversità, note, stock, ecc.).
Parametri: jobId (obbligatorio), reason (obbligatorio per history tracking), + campi da modificare.
⚠️ RICHIEDE APPROVAZIONE. Il campo reason deve citare la fonte della modifica.

create_job — Crea un nuovo job agricolo (TREATMENT, SEEDING, FERTILIZATION).
Parametri: productionUnitId (obbligatorio), tipo, prodotto, dose, data, avversità, ecc.
⚠️ RICHIEDE APPROVAZIONE. Richiede productionUnitId dal contesto (usa list_production_units).

merge_treatment_dates — Sposta ≥2 job alla stessa data target.
Parametri: jobIds (array), targetDate. Cambia solo la data, non quantità/stock.
⚠️ RICHIEDE APPROVAZIONE. Utile per raggruppare trattamenti nella stessa giornata.

optimize_selected_jobs — Distribuisce un trattamento su più date rispettando
intervalli minimi, finestra fenologica, N-max applicazioni ed epoca di impiego.
Complementare a optimize_dosage (LP per stock): questo tool distribuisce nel tempo.
⚠️ RICHIEDE APPROVAZIONE.`);
  }

  sections.push(buildSearchPriority(options));

  if (options.hasFieldNoteDelegation) {
    sections.push(`STRUMENTI DI DELEGAZIONE NOTE DI CAMPO:

delegate_to_field_note — Delega un messaggio all'agente Note di Campo.
Parametro: message. L'agente classificherà, cercherà campi/prodotti e proporrà il salvataggio.
Se REQUIRES_APPROVAL: presenta il riepilogo e attendi conferma. NON usare per pianificazione dosaggi.

approve_field_note — Approva e salva le operazioni proposte. RICHIEDE APPROVAZIONE.
Chiama SOLO dopo conferma dell'utente sul riepilogo di delegate_to_field_note.

reject_field_note — Rifiuta e invia feedback/correzioni al sotto-agente.
Parametro: feedback (es. "il campo era vigneto sud, non nord").`);
  }

  if (options.hasContextDiscovery) {
    sections.push(`STRUMENTI MODELLO ORDINE (VENDITE):

preview_order_template — Legge il MODELLO ordine Excel allegato e mostra un'anteprima normalizzata (cliente, righe, prodotti abbinati, canCreate). Read-only, NON crea nulla. Parametro: companyId.

import_sales_order_from_template — Crea l'ordine cliente in BOZZA dal modello allegato. ⚠️ RICHIEDE APPROVAZIONE.
Parametri: companyId, partnerId (opzionale). Se cliente/prodotti non abbinati, restituisce l'anteprima senza creare.
FLUSSO: preview_order_template → (se cliente assente) search_business_partners / create_business_partner → import_sales_order_from_template con partnerId.
NON usare extract_from_file/import_from_file per i modelli ordine.

generate_proforma — Genera una fattura PROFORMA (non fiscale) da un ordine BOZZA o CONFERMATO. ⚠️ RICHIEDE APPROVAZIONE.
Parametri: orderId, causale (opzionale). Non tocca magazzino né stato ordine. Documento da inviare al cliente prima della conferma.
CICLO ORDINE: import_sales_order_from_template (BOZZA) → [opzionale] generate_proforma → confirm_sales_order (CONFERMATO) → generate_ddt (EVASO) → stampa.`);
  }

  sections.push(`CONOSCENZA DI BASE (SOLO come sanity-check, MAI come fonte primaria):
- Captano su Melo/Pero: dose max ~2 kg/ha, max 4 interventi/anno, intervallo min 7 giorni
- Rame (solfato, idrossido, ossicloruro): limite UE 4 kg Cu metallo/ha/anno
- Zolfo su Vite/Melo contro Oidio: dose max 4-8 kg/ha, ammesso in biologico e integrato
- Glifosate: sconsigliato/non ammesso in molti disciplinari regionali per lotta integrata
- Qualsiasi dose SUPERIORE al limite di etichetta o del disciplinare è NON CONFORME
ATTENZIONE: Usa SEMPRE i tool per dati aggiornati. Questa conoscenza serve solo per plausibilità.

FORMATO RISPOSTA OBBLIGATORIO per analisi di conformità:

📋 **ETICHETTA** (dati ufficiali del prodotto):
- Principio attivo e nome commerciale
- Dose min/max con unità di misura; N. max applicazioni; Intervallo minimo (giorni); PHI (giorni)
- Fonte: [BDF | etichetta ministeriale | search_products]

📜 **DISCIPLINARE** (limiti regionali):
- Regione e anno; Dose max disciplinare; N. max interventi; Limitazioni aggiuntive
- Fonte: [search_rules | search_disciplinari_database | search_disciplinari_bdf_pdf]

✅ **VERDETTO FINALE**:
- Dose vs limite etichetta: ✅ | ❌
- Dose vs limite disciplinare: ✅ | ❌
- Verdetto complessivo: ✅ CONFORME | ❌ NON CONFORME | ⚠️ DA VERIFICARE

📎 **FONTI**: Elenca TUTTE le fonti. Per web: titolo + URL. Per BDF: "Banca Dati Fitofarmaci — Ministero della Salute".`);

  sections.push(`FORMATO OBBLIGATORIO per piani dosaggio/trattamento:
Ogni riga del piano deve includere prodotto, dose proposta, limite da etichetta, limite da disciplinare/regole azienda, stato bollettini/deroghe, PHI/carenza, verdetto e fonti.
Se un dato di etichetta, disciplinare o deroga non è disponibile, scrivi "DA VERIFICARE" per quello step.
Non presentare mai un trattamento come "CONFORME" quando manca una fonte obbligatoria.`);

  return sections.join('\n\n');
}
