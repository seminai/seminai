import fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';

/** Raw line extracted from the FatturaPA XML DettaglioLinee element. */
interface RawInvoiceLine {
  readonly productName: string;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly articleCode: string | null;
  readonly isDiscount: boolean;
}

/** Result returned by the FatturaPaParser. */
interface FatturaPaParseResult {
  readonly entries: ReadonlyArray<Omit<InvoiceEntry, 'productCategory' | 'administrativeStatus'>>;
}

const DISCOUNT_LINE_TYPES = new Set(['AC', 'SC']);
const SKIP_DESCRIPTIONS_REGEX =
  /^(SCONTO|SPESE INCASSO|SPESE DI TRASPORTO|BOLLO|ABBUONO|ARROTONDAMENTO)/i;

/**
 * Parses FatturaPA (Italian electronic invoice) XML files and extracts structured product data.
 * Supports the standard FatturaPA v1.2 schema with namespace prefix handling.
 */
export class FatturaPaParser {
  /**
   * Parses a FatturaPA XML file and extracts invoice entries.
   * @param filePath Absolute path to the XML file.
   */
  public async parseFromFile(filePath: string): Promise<FatturaPaParseResult> {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    return this.parseFromString(xmlContent);
  }

  /**
   * Parses a FatturaPA XML string and extracts invoice entries.
   * @param xmlContent Raw XML string of the FatturaPA document.
   */
  public async parseFromString(xmlContent: string): Promise<FatturaPaParseResult> {
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: false,
      tagNameProcessors: [this.stripNamespacePrefix],
    });
    if (this.isMetadataFile(parsed)) {
      console.log('[FATTURA_PA_PARSER] Skipping SDI metadata file (FileMetadati)');
      return { entries: [] };
    }
    const root = parsed.FatturaElettronica;
    if (!root) {
      throw new Error('Invalid FatturaPA XML: missing FatturaElettronica root element');
    }
    const header = root.FatturaElettronicaHeader;
    const body = this.normalizeToArray(root.FatturaElettronicaBody);
    const supplierInfo = this.extractSupplierInfo(header);
    const entries: Array<Omit<InvoiceEntry, 'productCategory'>> = [];
    for (const bodySection of body) {
      const documentInfo = this.extractDocumentInfo(bodySection);
      const lines = this.extractProductLines(bodySection);
      for (const line of lines) {
        if (line.isDiscount || SKIP_DESCRIPTIONS_REGEX.test(line.productName)) {
          continue;
        }
        entries.push({
          productName: line.productName,
          registrationNumber: line.articleCode,
          administrativeStatus: null,
          quantity: line.quantity,
          quantityUnitOfMeasure: line.quantityUnitOfMeasure,
          supplierName: supplierInfo.name,
          supplierVat: supplierInfo.vat,
          invoiceNumber: documentInfo.invoiceNumber,
          invoiceDate: documentInfo.invoiceDate,
          invoiceDueDate: documentInfo.invoiceDueDate,
          unitPrice: line.unitPrice,
          totalPrice: line.totalPrice,
        });
      }
    }
    return { entries };
  }

  /**
   * Detects SDI metadata files (FileMetadati) which are not actual invoices.
   * These files contain metadata about the invoice (IdentificativoSdI, NomeFile, Hash, etc.).
   */
  private isMetadataFile(parsed: Record<string, unknown>): boolean {
    return parsed.FileMetadati !== undefined;
  }

  /**
   * Strips namespace prefixes from XML tag names (e.g. "p:FatturaElettronica" -> "FatturaElettronica").
   */
  private stripNamespacePrefix(name: string): string {
    const colonIndex = name.indexOf(':');
    return colonIndex >= 0 ? name.substring(colonIndex + 1) : name;
  }

  /**
   * Extracts supplier name and VAT from FatturaElettronicaHeader.CedentePrestatore.
   */
  private extractSupplierInfo(header: Record<string, unknown>): {
    name: string | null;
    vat: string | null;
  } {
    const cedente = header?.CedentePrestatore as Record<string, unknown> | undefined;
    if (!cedente) {
      return { name: null, vat: null };
    }
    const datiAnagrafici = cedente.DatiAnagrafici as Record<string, unknown> | undefined;
    const anagrafica = datiAnagrafici?.Anagrafica as Record<string, unknown> | undefined;
    const denominazione = anagrafica?.Denominazione as string | undefined;
    const nome = anagrafica?.Nome as string | undefined;
    const cognome = anagrafica?.Cognome as string | undefined;
    const name = denominazione ?? (nome && cognome ? `${nome} ${cognome}` : null);
    const idFiscaleIva = datiAnagrafici?.IdFiscaleIVA as Record<string, unknown> | undefined;
    const vat = (idFiscaleIva?.IdCodice as string) ?? null;
    return { name: name ?? null, vat };
  }

  /**
   * Extracts invoice number and date from DatiGeneraliDocumento.
   */
  private extractDocumentInfo(body: Record<string, unknown>): {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    invoiceDueDate: string | null;
  } {
    const datiGenerali = body?.DatiGenerali as Record<string, unknown> | undefined;
    const datiDoc = datiGenerali?.DatiGeneraliDocumento as Record<string, unknown> | undefined;
    const invoiceNumber = (datiDoc?.Numero as string) ?? null;
    const invoiceDate = (datiDoc?.Data as string) ?? null;
    const invoiceDueDate = this.extractInvoiceDueDate(body);
    return { invoiceNumber, invoiceDate, invoiceDueDate };
  }

  /**
   * Extracts invoice due date from DatiPagamento.DettaglioPagamento.
   */
  private extractInvoiceDueDate(body: Record<string, unknown>): string | null {
    const paymentSections = this.normalizeToArray(body?.DatiPagamento);
    for (const paymentSection of paymentSections) {
      const paymentDetails = this.normalizeToArray(paymentSection.DettaglioPagamento);
      for (const paymentDetail of paymentDetails) {
        const dueDate = (paymentDetail.DataScadenzaPagamento as string) ?? null;
        if (dueDate) {
          return dueDate;
        }
      }
    }
    return null;
  }

  /**
   * Extracts product lines from DatiBeniServizi.DettaglioLinee.
   */
  private extractProductLines(body: Record<string, unknown>): ReadonlyArray<RawInvoiceLine> {
    const datiBeniServizi = body?.DatiBeniServizi as Record<string, unknown> | undefined;
    if (!datiBeniServizi) {
      return [];
    }
    const dettaglioLinee = this.normalizeToArray(datiBeniServizi.DettaglioLinee);
    return dettaglioLinee.map((linea) => this.parseDettaglioLinea(linea));
  }

  /**
   * Parses a single DettaglioLinee element into a RawInvoiceLine.
   */
  private parseDettaglioLinea(linea: Record<string, unknown>): RawInvoiceLine {
    const descrizione = (linea.Descrizione as string) ?? '';
    const quantitaRaw = linea.Quantita as string | undefined;
    const quantity = quantitaRaw ? parseFloat(quantitaRaw) : null;
    const unitaMisura = (linea.UnitaMisura as string) ?? null;
    const prezzoUnitarioRaw = linea.PrezzoUnitario as string | undefined;
    const unitPrice = prezzoUnitarioRaw ? parseFloat(prezzoUnitarioRaw) : null;
    const prezzoTotaleRaw = linea.PrezzoTotale as string | undefined;
    const totalPrice = prezzoTotaleRaw ? parseFloat(prezzoTotaleRaw) : null;
    const tipoCessione = linea.TipoCessionePrestazione as string | undefined;
    const isDiscount = tipoCessione ? DISCOUNT_LINE_TYPES.has(tipoCessione) : false;
    const articleCode = this.extractArticleCode(linea);
    return {
      productName: descrizione.trim(),
      quantity: quantity !== null && !isNaN(quantity) ? quantity : null,
      quantityUnitOfMeasure: unitaMisura,
      unitPrice: unitPrice !== null && !isNaN(unitPrice) ? unitPrice : null,
      totalPrice: totalPrice !== null && !isNaN(totalPrice) ? totalPrice : null,
      articleCode,
      isDiscount,
    };
  }

  /**
   * Extracts article code from CodiceArticolo element. Returns null if none found.
   */
  private extractArticleCode(linea: Record<string, unknown>): string | null {
    const codiceArticolo = linea.CodiceArticolo;
    if (!codiceArticolo) {
      return null;
    }
    const codes = this.normalizeToArray(codiceArticolo);
    for (const code of codes) {
      const valore = code.CodiceValore as string | undefined;
      if (valore) {
        return valore;
      }
    }
    return null;
  }

  /**
   * Normalizes a value to an array. If already an array, returns as-is. If single object, wraps in array.
   */
  private normalizeToArray(value: unknown): Array<Record<string, unknown>> {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value as Array<Record<string, unknown>>;
    }
    return [value as Record<string, unknown>];
  }
}
