export interface FieldUpsertData {
  /** Nome della compagnia per identificare l'azienda */
  companyName?: string;

  /** Partita IVA della compagnia per identificare l'azienda */
  vatNumber?: string;

  /** Nome del campo */
  name: string;

  /** Coordinate geografiche (array di numeri, es: [longitude, latitude]) */
  coordinates: number[];

  /** Latitudine */
  latitude?: number;

  /** Longitudine */
  longitude?: number;

  /** Poligono geografico (JSON) */
  polygon?: unknown;

  /** Area in ettari GIS */
  gisHa?: number;

  /** Area in ettari SAU */
  sauHa?: number;

  /** pH del suolo */
  ph?: number;

  /** Azoto nel suolo */
  nitrogen?: number;

  /** Fosforo nel suolo */
  phosphorus?: number;

  /** Potassio nel suolo */
  potassium?: number;

  /** Calcio nel suolo */
  calcium?: number;

  /** Magnesio nel suolo */
  magnesium?: number;

  /** Tipo di suolo */
  soilType?: string;

  /** Uso del suolo */
  uso?: string;

  /** Qualità del suolo */
  qualita?: string;

  /** Superficie catastale in metri quadrati */
  superficieCatastaleMq?: number;

  /** Sezione catastale */
  sezione?: string;

  /** Foglio catastale */
  foglio?: string;

  /** Particella catastale */
  particella?: string;

  /** Subalterno (opzionale) */
  subalterno?: string;

  /** Nazione */
  nation?: string;

  /** Regione */
  region?: string;

  /** Città */
  city?: string;

  /** Indirizzo */
  address?: string;

  /** CAP */
  cap?: string;

  /** Variazione in metri quadrati */
  variazioneMq?: string;

  /** Data inizio conduzione */
  inizioConduzione?: Date;

  /** Data fine conduzione */
  fineConduzione?: Date;
}

export interface ProductionUnitImportData {
  /** Nome dell'unità produttiva */
  name: string;

  /** Nome della coltura */
  cropName: string;

  /** Tipo di coltura */
  cropType: string;

  /** Varietà */
  variety: string;

  /** Protocollo */
  protocoll: string;

  /** Struttura di protezione */
  protectionStructure: string;

  /** Data inizio */
  startDate: Date;

  /** Data fioritura */
  floweringDate: Date;

  /** Data raccolta */
  harvestingDate: Date;

  /** Data fine */
  endDate: Date;

  /** Occupazione (opzionale) */
  occupazione?: string;

  /** Destinazione d'uso (opzionale) */
  destinazioneDiUso?: string;

  /** Acqua totale per periodo in litri */
  acquaTotalePeridoL?: number;

  /** Cicli colturali multipli (es. coltura primaria e secondaria) */
  cycles?: Array<{
    cycleIndex: number;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    protectionStructure: string;
    floweringDate?: Date;
    harvestingDate?: Date;
    occupazione?: string;
    destinazioneDiUso?: string;
    acquaTotalePeridoL?: number;
    seasonYear?: number;
  }>;

  /** Campi associati con le aree */
  fieldAllocations: Array<{
    /** Explicit field id when the review payload already resolved the allocation */
    fieldId?: string;
    /** Nome del campo */
    fieldName: string;
    /** Municipality used to disambiguate cadastral references */
    comune?: string;
    /** National cadastral municipality code, when present in source data */
    codiceNazionale?: string;
    /** Sezione catastale */
    sezione?: string;
    /** Foglio catastale */
    foglio?: string;
    /** Particella catastale */
    particella?: string;
    /** Subalterno (opzionale) */
    subalterno?: string;
    /** Area in ettari su questo campo */
    areaHa: number;
  }>;
}

export interface BulkImportDTO {
  /** ID dell'utente che effettua l'import */
  userId: string;

  /** Nome della compagnia (se fornito, sovrascrive quello dei field) */
  companyName?: string;

  /** Partita IVA della compagnia (se fornito, sovrascrive quello dei field) */
  vatNumber?: string;

  /** Dati dei campi da upsertare */
  fields: FieldUpsertData[];

  /** Dati delle unità produttive da creare */
  productionUnits: ProductionUnitImportData[];
}
