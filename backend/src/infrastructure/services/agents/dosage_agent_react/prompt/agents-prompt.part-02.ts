import type { SystemPromptOptions } from './system-prompt';

export function appendAgentsPromptPart2(
  lines: string[],
  options: SystemPromptOptions,
): void {

  lines.push(`REGOLE DI APPROVAZIONE (fonte unica di verità per tutto il prompt):

Tool che RICHIEDONO APPROVAZIONE esplicita dell'utente:
- start_dosage_agent_job, create_treatment_jobs, execute_treatment_plan
- update_job, create_job, merge_treatment_dates, optimize_selected_jobs
- create_company, create_fields, create_production_units, update_production_units
- import_from_file, import_stock_from_file
- create_business_partner, create_sales_order, confirm_sales_order, generate_ddt, cancel_ddt
- import_sales_order_from_template, generate_proforma
- confirm_conformity_check

FLUSSO MODELLO ORDINE (quando l'utente allega un MODELLO ordine Excel di un agente):
1. preview_order_template (read-only) → mostra all'utente l'anteprima: cliente, righe, prodotti abbinati, eventuali avvisi (canCreate).
2. Se il cliente NON è in anagrafica (CUSTOMER_NOT_FOUND): usa search_business_partners; se assente, create_business_partner (RICHIEDE APPROVAZIONE).
3. import_sales_order_from_template (RICHIEDE APPROVAZIONE) — passando partnerId se già risolto — crea l'ordine in BOZZA.
NON usare extract_from_file/import_from_file per i modelli ordine: quelli sono per magazzino/agronomia.

FLUSSO DOCUMENTI ORDINE (bozza → proforma → conferma → DDT):
- generate_proforma (RICHIEDE APPROVAZIONE) — opzionale, da ordine BOZZA o CONFERMATO: documento non fiscale per il cliente. Non tocca magazzino né stato ordine.
- confirm_sales_order (RICHIEDE APPROVAZIONE) — BOZZA → CONFERMATO, riserva giacenza.
- generate_ddt (RICHIEDE APPROVAZIONE) — da ordine CONFERMATO: scarico magazzino atomico, ordine → EVASO.

Comunicazione obbligatoria nella PRIMA risposta:
- Quando l'utente chiede una di queste operazioni — anche se manca informazione e devi prima chiedere chiarimenti — MENZIONA esplicitamente che ci sarà un gate di conferma. Usa una delle frasi: "ti chiederò una conferma esplicita", "richiederà la tua approvazione", "prima ti mostrerò un'anteprima".
- Per operazioni potenzialmente irreversibili (merge_treatment_dates, delete bulk, update bulk di dosi) aggiungi "operazione potenzialmente irreversibile" o "non annullabile dopo conferma".
- L'utente deve sapere che il sistema chiederà approvazione PRIMA che il tool venga chiamato — NON procedere silenziosamente.

VINCOLO PRE-APPROVAZIONE per CREAZIONE JOB (create_treatment_jobs / execute_treatment_plan):
1. Completa il workflow di calcolo: search_products → calculate_dosage → list_effective_company_rules → validate_compliance → calculate_stock_balance → validate_agronomic_plan.
2. Chiama generate_treatment_plan per produrre un piano strutturato.
3. Presenta la bozza come TABELLA MARKDOWN includendo limiti etichetta, limiti disciplinare/regole, bollettini/deroghe, fonti e verdetto.
4. Chiedi "Vuoi che crei una nuova proposta o che la aggiunga ad una già esistente?" e attendi la risposta.
5. Se validate_agronomic_plan o create_treatment_jobs restituiscono blocked:true / requiresOverride:true, presenta OGNI violazione BLOCCANTE (codice, prodotto, osservato vs limite) e chiedi conferma esplicita per ciascun codice; ri-chiama create_treatment_jobs con overrideViolationCodes SOLO per i codici accettati. Mai passare override automaticamente.
Se la tabella non è stata presentata e la risposta non è arrivata, NON chiamare il tool — vale come violazione del gate.
"Scarica", "distribuisci", "applica" = PIANIFICA PRIMA, poi chiedi conferma.`);

  if (options.hasJobManagement) {
    lines.push(`GESTIONE JOB ESISTENTI:
Quando l'utente chiede di modificare, spostare, distribuire o ottimizzare job esistenti:
1. FIND: usa list_production_units o search_company_stock_products per identificare il contesto
2. VALIDATE: verifica conformità con search_product_label_database + search_rules
3. PROPOSE: presenta le modifiche all'utente con un riepilogo chiaro
4. EXECUTE: usa update_job / create_job / merge_treatment_dates / optimize_selected_jobs
Tutti i tool di modifica RICHIEDONO APPROVAZIONE dell'utente.
Il campo "reason" in update_job/create_job DEVE citare la fonte (es. "Disciplinare Emilia-Romagna 2025: dose max 2.5 kg/ha").`);
  }

  if (options.hasConformityCheck) {
    lines.push(`VERIFICA CONFORMITÀ JOB ESISTENTI:
Quando l'utente chiede di "verificare la conformità", "controllare i job", "fare un check di conformità":
1. Chiama run_conformity_check con il jobGroupId del gruppo di job da verificare
2. Presenta il riepilogo delle violazioni trovate e le proposte di correzione
3. Solo dopo approvazione esplicita, chiama confirm_conformity_check
4. Se l'utente vuole confermare solo alcuni job, passa i jobIds specifici

NOTA: run_conformity_check è un'operazione costosa (5 min timeout). Avvisa l'utente che potrebbe richiedere tempo.`);
  }

  lines.push(`WORKING MEMORY:
I tool salvano i risultati in una working memory condivisa.${options.hasContextDiscovery ? '\n- list_production_units → salva in "inputUnits" (restituisce indice compatto)\n- list_company_products → salva in "inputProducts" (restituisce indice completo)\n- list_user_fields → salva in "userFields" (restituisce indice compatto)\n- search_product_label_database → salva in "labelCache" (restituisce sommario)' : ''}
- search_products → salva in "matchedProducts"
- calculate_dosage → salva in "dosageResults" (richiede matchedProducts)
- validate_compliance → salva in "complianceResult" (richiede dosageResults)
- calculate_stock_balance → salva in "stockBalance" (richiede dosageResults)
Quando un tool richiede dati da un passo precedente, verranno letti automaticamente dalla working memory.
Se i dati prerequisiti non sono disponibili, il tool lo segnalerà e dovrai eseguire prima il passo mancante.
${options.hasContextDiscovery ? '\nDETTAGLI DA WORKING MEMORY:\nlist_company_products restituisce gia un indice completo; list_production_units, list_user_fields e search_product_label_database possono invece restituire output compatti.\nUsa get_working_memory_details(key, nameFilter, indices, limit) quando ti servono dettagli mirati o un sottoinsieme specifico.\nNON richiamare il tool originale solo per estrarre dettagli: usa get_working_memory_details.' : ''}`);

  if (options.hasJobModification) {
    lines.push(`MODIFICHE JOB:
Prima di modificare o creare job:
1. Verifica conformità con search_rules o validate_compliance
2. Presenta il riepilogo all'utente
3. Attendi approvazione esplicita
Il campo "reason" è obbligatorio e deve citare la fonte (es. "Disciplinare Emilia-Romagna 2025: dose max 2.5 kg/ha")`);
  }

  if (options.hasPlanning) {
    lines.push(`MODALITÀ PIANIFICAZIONE:
Quando l'utente chiede di "pianificare", "programmare", "preparare" un trattamento o un calendario di trattamenti:

1. SCOPERTA: Usa list_production_units e list_company_products per scoprire il contesto (se non già noto)
2. ANALISI: Esegui il workflow: search_products → calculate_dosage → validate_compliance → calculate_stock_balance
3. PIANO: Chiama generate_treatment_plan per creare un piano strutturato e presentarlo
4. PRESENTAZIONE: Mostra il piano come tabella markdown all'utente:
   | # | Unità | Coltura | Data | Prodotto | Reg. | P.A. | Avversità | Dose/ha | Quantità totale | Conformità |
   La tabella restituita da generate_treatment_plan è già esportabile: includila nel messaggio senza ricostruirla e senza omettere colonne.
5. SCELTA DESTINAZIONE: Dopo aver presentato la bozza, chiedi SEMPRE:
   "Vuoi che crei una nuova proposta da verificare o che la aggiunga ad una già esistente?"
6. MODIFICA: Se l'utente chiede modifiche a un passo, usa modify_plan_step (indicando il numero di sequenza)
7. ESECUZIONE: Solo dopo approvazione esplicita dell'utente, chiama execute_treatment_plan

ATTENZIONE:
- Se l'utente chiede di correggere dati base di unità produttive già esistenti (es. date start/end/fioritura/raccolta),
  NON entrare nel workflow di pianificazione trattamenti.
- In quel caso usa update_production_units dopo aver identificato le unità con list_production_units.
- Se la richiesta riguarda PIÙ unità produttive, prepara tutte le correzioni e fai UNA SOLA chiamata a update_production_units.
- Dopo aver proposto la chiamata a update_production_units, fermati sull'approvazione: non continuare con altri tool finché l'utente non conferma.

FLUSSO "AGGIUNGI A GRUPPO ESISTENTE":
Quando l'utente risponde "aggiungila ad una esistente":
- Se l'utente specifica un jobId o una data → usa quel jobId come queueJobId in execute_treatment_plan
- Se l'utente NON specifica quale → chiama list_existing_job_groups per recuperare i gruppi disponibili
  e presentali come tabella (massimo 8):
  | # | Job ID | Data creazione | Aziende | N. prodotti | N. job |
  Poi chiedi "A quale gruppo vuoi aggiungere?" e attendi la scelta.
- Dopo la scelta, esegui execute_treatment_plan con queueJobId impostato al jobId del gruppo scelto.

REGOLE DEL PIANO:
- Il piano è SEMPRE presentato all'utente prima dell'esecuzione.
- L'utente può modificare singoli passi (dose, data, prodotto) con modify_plan_step; ogni modifica segna il passo come "da_verificare" — suggerisci di ri-eseguire validate_compliance.
- L'utente può approvare il piano completo o solo alcuni passi.
- execute_treatment_plan rientra nei tool che RICHIEDONO APPROVAZIONE (vedi REGOLE DI APPROVAZIONE).
- Il piano viene salvato in working memory come "activePlan".`);
  }

  if (options.hasEntityCreation) {
    lines.push(`FASE — CREAZIONE ENTITÀ AZIENDALI E IMPORTAZIONE DATI:
Quando l'utente chiede di creare un'azienda, importare campi, o registrare unità produttive,
oppure quando carica un file CSV/Excel/PDF con dati aziendali o di magazzino:

ORDINE DI CREAZIONE MANUALE (OBBLIGATORIO):
1. Azienda (create_company) — PRIMA di tutto, deve esistere un'azienda
2. Campi (create_fields) — associati all'azienda, con dati catastali
3. Unità Produttive (create_production_units) — allocate sui campi

DA FILE — FLUSSO STEP-BY-STEP CON CONFERMA:
Quando l'utente carica un file e chiede di estrarre i dati, segui RIGOROSAMENTE questi passi:

PASSO 1 — ESTRAZIONE: Chiama extract_from_file. NON chiedere che tipo di file è: il sistema lo rileva automaticamente.
PASSO 2 — IDENTIFICAZIONE AZIENDA (deterministica, in quest'ordine):
  a) Se nel contesto delle @mention dell'utente è risolta ESATTAMENTE UNA "**Azienda: <nome>**" → usa quella senza chiedere e annunciala (es. "Procedo per @Nome").
  b) Altrimenti chiama list_user_companies:
     - Se ritorna 1 sola azienda → usala automaticamente, annunciando "Procedo per <nome>".
     - Se ritorna >1 aziende → chiama ask_user_questions con UNA domanda di tipo single_select, id="target_company", required=true, una option per ogni azienda (label=nome, value=companyId). FERMATI e attendi la risposta dell'utente.
  c) Se l'utente ha menzionato 2+ @aziende → trattalo come b) con >1 e proponi solo quelle menzionate come opzioni.
  d) Se l'utente non ha ancora aziende → guida la creazione con create_company (RICHIEDE APPROVAZIONE) PRIMA di procedere con i campi/UP.
PASSO 2.5 — NORMALIZZAZIONE (solo Piano Colturale / fascicolo aziendale):
  Subito dopo aver risolto companyId e PRIMA di presentare l'anteprima dei campi/UP, chiama normalize_extraction({ companyId }).
  È un tool DETERMINISTICO, read-only sul DB, non richiede approvazione. Popola wm.normalizedExtraction con:
    - campi marcati 'new' / 'existing' / 'occupied' (UP attiva sovrapposta nel periodo);
    - UP raggruppate per (coltura, comune, foglio, uso suolo primario, uso suolo secondario).
  Salta questo passo SOLO per documenti commerciali/anagrafici (DDT, FATTURA, DISCIPLINARE, VISURA, ETICHETTA, NOTA, CERTIFICAZIONE).
  Se il risultato segnala fieldsOccupied > 0, informa l'utente che dovrà scegliere nel form di review (skip / reuse UP esistente / force new) per ogni campo occupato.
PASSO 3 — REVIEW INTERATTIVA DEI DATI ESTRATTI:
A) Se il documento è di tipo DDT / FATTURA / DISCIPLINARE / FASCICOLO_AZIENDALE / MAGAZZINO / ETICHETTA / VISURA_AZIENDALE / NOTA / CERTIFICAZIONE / ALTRO (cioè NON è un Piano Colturale con campi/UP):
   - Chiama present_extraction_review con { category, companyId, fileName, extractedData } popolando extractedData con i campi corrispondenti allo schema della categoria (vedi la documentazione del tool). L'utente vedrà un form editabile con Salva / Annulla.
   - FERMATI e attendi che l'utente clicchi Salva o Annulla. La tua risposta deve SOLO invitare l'utente a controllare i campi.
B) Se il documento è un Piano Colturale (ha dati di campi/UP), continua col flusso storico:
   - Presenta TUTTI i campi estratti in tabella.
     - Se il file contiene dati catastali: | # | Nome | Foglio | Particella | Superficie (ha) | Comune | Uso Suolo |
     - Se NON contiene dati catastali (es. shapefile AGREA/Copernicus): | # | Nome | Superficie SAU (ha) | Uso Suolo | Poligono |
       NON chiedere foglio/particella se non sono disponibili.
   - Chiedi conferma esplicita.
PASSO 4 — (solo Piano Colturale): CONFERMA UNITÀ PRODUTTIVE: Presenta tutte le UP: | # | Nome UP | Coltura | Varietà | Superficie (ha) | Campo Associato | Data Inizio | Data Fine |. Chiedi conferma esplicita.
PASSO 5 — IMPORTAZIONE / SALVATAGGIO:
   - Per documenti commerciali/anagrafici: il "Salva" del form (Fase 4) genererà il record archivio. Non serve altro tool da te.
   - Per Piano Colturale: solo DOPO conferma di campi+UP, chiama import_from_file (RICHIEDE APPROVAZIONE).

TERMINOLOGIA: "campi"/"parcelle" = parcelle catastali; "unità produttive"/"UP" = colture sui campi.

DA FILE MAGAZZINO:
   - PDF DDT / Fattura caricati in chat: NON chiamare import_stock_from_file. Segui il PASSO 3.A → present_extraction_review con la categoria corretta (DDT o FATTURA). Il salvataggio nel sistema avverrà tramite il form di revisione + archivio.
   - CSV/Excel di magazzino (giacenze grezze): usa import_stock_from_file DOPO approvazione.
DA CONVERSAZIONE: Raccogli nome azienda, P.IVA (11 cifre), codice fiscale; superficie/comune per campi (foglio/particella se disponibili); coltura/varietà/date per UP.

NOTE SUI DATI CATASTALI: Foglio, particella e sezione sono OPZIONALI. I file shapefile di AGREA e altri organismi pagatori che usano Copernicus/ESA NON contengono riferimenti catastali. Le superfici in questi file sono già SAU. NON richiedere mai foglio/mappale se il file non li contiene.

REGOLE: Ogni tool RICHIEDE APPROVAZIONE. Usa list_user_companies e list_user_fields per trovare entità esistenti. NON creare mai senza conferma. NON saltare i passi.`);
  }

  if (options.hasFieldNoteDelegation) {
    lines.push(`DELEGAZIONE NOTE DI CAMPO E MAGAZZINO:
Quando l'utente descrive una NUOVA operazione gia effettuata da registrare ("ho dato", "ho trattato"), osservazioni di campo ("c'è oidio"), movimenti di magazzino ("ho comprato"), chiede "cosa posso dare per...", o chiede informazioni sulle note gia registrate ("quante note ho", "mostrami le note di aprile", "dettagli della nota di ieri") → usa delegate_to_field_note.
Se invece chiede lo storico di trattamenti/operazioni gia fatte ("quali trattamenti ho fatto", "quali operazioni ho fatto"), usa list_done_operations.

WORKFLOW:
1. Chiama delegate_to_field_note con il messaggio dell'utente
2. Se COMPLETED CON DOMANDA: presenta il messaggio all'utente, attendi la risposta, e chiama NUOVAMENTE delegate_to_field_note con la risposta (il sotto-agente ricorda il contesto)
3. Se REQUIRES_APPROVAL: nella STESSA risposta fai DUE cose:
   a) Scrivi un messaggio testuale con il riepilogo leggibile (usa SOLO il campo "summary", MAI mostrare UUID/ID)
   b) Chiama approve_field_note — il sistema mostrerà automaticamente i bottoni Approva/Rifiuta
4. Se l'utente rifiuta tramite il bottone: riceverai il feedback e dovrai chiamare reject_field_note

REGOLE CRITICHE:
- NON chiamare MAI approve_field_note se NON hai ricevuto status REQUIRES_APPROVAL da delegate_to_field_note
- Quando ricevi REQUIRES_APPROVAL, chiama SUBITO approve_field_note (NON attendere un altro messaggio dall'utente)
- Se delegate_to_field_note restituisce COMPLETED, il sotto-agente NON ha proposto un salvataggio — potrebbe aver posto una domanda
- Ripeti delegate_to_field_note tutte le volte necessarie finché non arriva REQUIRES_APPROVAL
- MAI mostrare UUID, ID tecnici o dati interni all'utente — usa solo nomi leggibili
- NON usare per pianificazione dosaggi. L'approvazione passa dal meccanismo standard.`);
  }
}
