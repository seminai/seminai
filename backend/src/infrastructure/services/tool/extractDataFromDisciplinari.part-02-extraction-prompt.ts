/**
 * Prompt for extracting structured data from disciplinari text.
 */
export const EXTRACTION_PROMPT = `Sei un esperto nell'estrazione di dati strutturati da disciplinari di produzione integrata italiani.
Analizza il seguente testo estratto da un disciplinare PDF e estrai le informazioni strutturate.

IMPORTANTE: I disciplinari contengono tabelle con informazioni su:
- Sostanze attive/prodotti ammessi
- Dosi minime e massime (in varie unità: kg/ha, L/ha, g/hl, %)
- Numero massimo di interventi (per anno, ciclo, stagione)
- Intervalli minimi tra trattamenti (giorni)
- Finestre fenologiche (stadi BBCH o descrizioni)
- Vincoli e limitazioni

LINEE GUIDA ESTRAZIONE:
1. METADATI DOCUMENTO: Cerca nel testo:
   - Regione (es. "Emilia-Romagna", "Piemonte")
   - Anno (es. "2025", "Anno 2024")
   - Versione (es. "Rev. 1", "Versione 2.0")
   - Titolo (es. "Disciplinari di Produzione Integrata - Difesa")
   - Date validità: cerca frasi come "Valido dal", "In vigore fino al", "Anno di riferimento"

2. REGOLE GENERALI: Estrai:
   - Principi generali (priorità mezzi agronomici, soglie, etc.)
   - Divieti espliciti
   - Azioni obbligatorie (monitoraggi, registrazioni)

3. INTERVENTI AMMESSI: Per ogni riga/voce trovata:
   - Nome sostanza attiva o prodotto
   - Dose minima e massima con unità di misura
   - Numero massimo interventi e ambito (anno/ciclo)
   - Intervallo minimo giorni tra trattamenti
   - Stadio fenologico ammesso (BBCH o descrizione)
   - Note e vincoli

4. NORMALIZZAZIONE:
   - Converti range come "1,5-2 kg/ha" in min: 1.5, max: 2.0, unit: "kg/ha"
   - Se solo un valore (es. "2 kg/ha"), usa lo stesso per min e max
   - Estrai "max 3 interventi/anno" come applications.max: 3, applications.scope: "anno"

SCHEMA JSON RICHIESTO:
{{
  "documentMetadata": {{
    "region": "string o null",
    "year": number o null,
    "version": "string o null",
    "title": "string o null",
    "sourceUrlOrFile": null,
    "validFrom": "YYYY-MM-DD o null",
    "validUntil": "YYYY-MM-DD o null",
    "isExpired": false
  }},
  "scopeEntities": [
    {{
      "crop": {{ "name": "string", "group": "string o null" }},
      "section": {{ "name": "string" }},
      "subsection": {{ "name": "string o null" }} o null
    }}
  ],
  "rules": {{
    "generalPrinciples": ["string"],
    "prohibitions": ["string"],
    "mandatoryActions": ["string"],
    "definitions": [{{ "term": "string", "definition": "string" }}]
  }},
  "defenseTargets": [
    {{
      "target": {{ "name": "string", "type": "insetto|fungo|infestante|altro" }},
      "monitoring": ["string"],
      "agronomicMeasures": ["string"],
      "biologicalMeasures": ["string"],
      "interventions": [
        {{
          "productOrActive": {{ "name": "string", "normalized": "string o null" }},
          "formulation": "string o null",
          "dose": {{
            "min": number o null,
            "max": number o null,
            "unit": "string o null",
            "notes": "string o null"
          }},
          "applications": {{
            "min": number o null,
            "max": number o null,
            "scope": "anno|ciclo colturale|stagione|finestra fenologica|null"
          }},
          "interval": {{ "minDays": number o null }},
          "phi": {{ "preharvestIntervalDays": number o null }} o null,
          "phenology": {{ "from": "string o null", "to": "string o null" }},
          "constraints": ["string"],
          "environmentalConstraints": ["string"],
          "resistanceManagement": ["string"],
          "notes": "string o null",
          "sourceLocator": {{
            "page": number o null,
            "tableId": "string o null",
            "rowHint": "string o null"
          }}
        }}
      ]
    }}
  ],
  "extractionConfidence": number (0-100),
  "extractionErrors": ["string"]
}}

TESTO DA ANALIZZARE:
{text}

{format_instructions}

Rispondi SOLO con il JSON nello schema esatto sopra, senza testo aggiuntivo.`;
