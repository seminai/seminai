import fs from 'fs';
import path from 'path';

interface FitosanitariRecord {
  num_registrazione: string;
  denominazione_prodotto: string;
  stato_amministrativo: string;
  sostanze_attive?: string;
}

export class FitosanitariLookupService {
  private static instance: FitosanitariLookupService | null = null;
  private statusByRegistrationAndName: Map<string, Map<string, string>> | null = null;
  private activeIngredientsByRegistrationAndName: Map<string, Map<string, string>> | null = null;

  private constructor() {}

  static getInstance(): FitosanitariLookupService {
    if (!FitosanitariLookupService.instance) {
      FitosanitariLookupService.instance = new FitosanitariLookupService();
    }
    return FitosanitariLookupService.instance;
  }

  private loadData(): void {
    if (this.statusByRegistrationAndName !== null) {
      return;
    }

    const fitosanitariPath = path.join(
      __dirname,
      '../../../../dataset/fitosanitari/fts_06062025.json',
    );

    if (!fs.existsSync(fitosanitariPath)) {
      console.warn('Fitosanitari file not found, administrative status lookup disabled');
      this.statusByRegistrationAndName = new Map();
      this.activeIngredientsByRegistrationAndName = new Map();
      return;
    }

    try {
      const fileContent = fs.readFileSync(fitosanitariPath, 'utf-8');
      const records = JSON.parse(fileContent) as FitosanitariRecord[];
      this.statusByRegistrationAndName = new Map<string, Map<string, string>>();
      this.activeIngredientsByRegistrationAndName = new Map<string, Map<string, string>>();
      for (const item of records) {
        const normalizedRegistrationNumber = this.normalizeRegistrationNumber(
          item.num_registrazione,
        );
        const normalizedName = this.normalizeName(item.denominazione_prodotto);
        if (!normalizedRegistrationNumber || !normalizedName) {
          continue;
        }
        if (item.stato_amministrativo) {
          this.upsertByRegistration(
            this.statusByRegistrationAndName,
            normalizedRegistrationNumber,
            normalizedName,
            item.stato_amministrativo,
          );
        }
        const activeIngredients = item.sostanze_attive?.trim();
        if (activeIngredients) {
          this.upsertByRegistration(
            this.activeIngredientsByRegistrationAndName,
            normalizedRegistrationNumber,
            normalizedName,
            activeIngredients,
          );
        }
      }
    } catch (error) {
      console.error('Error loading fitosanitari file:', error);
      this.statusByRegistrationAndName = new Map();
      this.activeIngredientsByRegistrationAndName = new Map();
    }
  }

  private upsertByRegistration(
    target: Map<string, Map<string, string>>,
    registrationKey: string,
    nameKey: string,
    value: string,
  ): void {
    const byName = target.get(registrationKey);
    if (byName) {
      byName.set(nameKey, value);
      return;
    }
    const fresh = new Map<string, string>();
    fresh.set(nameKey, value);
    target.set(registrationKey, fresh);
  }

  private normalizeName(name: string): string {
    return name.toUpperCase().trim().replace(/\s+/g, ' ');
  }

  private normalizeRegistrationNumber(
    registrationNumber: string | null | undefined,
  ): string | null {
    if (!registrationNumber) {
      return null;
    }
    const sanitized = registrationNumber.trim();
    if (!sanitized) {
      return null;
    }
    if (/^\d+$/.test(sanitized)) {
      const noLeadingZeros = sanitized.replace(/^0+/, '');
      return noLeadingZeros.length > 0 ? noLeadingZeros : '0';
    }
    return sanitized.toUpperCase();
  }

  lookupStatus(
    registrationNumber: string | null | undefined,
    productName: string | null | undefined,
  ): string | null {
    this.loadData();
    return this.lookupByRegistrationAndName(
      this.statusByRegistrationAndName!,
      registrationNumber,
      productName,
    );
  }

  lookupActiveIngredients(
    registrationNumber: string | null | undefined,
    productName: string | null | undefined,
  ): string | null {
    this.loadData();
    return this.lookupByRegistrationAndName(
      this.activeIngredientsByRegistrationAndName!,
      registrationNumber,
      productName,
    );
  }

  private lookupByRegistrationAndName(
    source: Map<string, Map<string, string>>,
    registrationNumber: string | null | undefined,
    productName: string | null | undefined,
  ): string | null {
    const normalizedRegistrationNumber = this.normalizeRegistrationNumber(registrationNumber);
    if (!normalizedRegistrationNumber) {
      return null;
    }
    const valuesByName = source.get(normalizedRegistrationNumber);
    if (!valuesByName) {
      return null;
    }

    // Try exact match on both registration number and product name
    const normalizedName = productName ? this.normalizeName(productName) : null;
    if (normalizedName) {
      const exactMatch = valuesByName.get(normalizedName);
      if (exactMatch) {
        return exactMatch;
      }
    }

    // Fallback: registration numbers are typically unique per product
    // in the Italian fitosanitari system, so the first entry is a safe
    // fallback when users enter slightly different product names.
    const firstEntry = valuesByName.values().next();
    return firstEntry.done ? null : firstEntry.value;
  }

  /**
   * Checks whether a given registration number exists in the ministry dataset.
   */
  existsRegistrationNumber(registrationNumber: string | null | undefined): boolean {
    const normalized = this.normalizeRegistrationNumber(registrationNumber);
    if (!normalized) return false;
    this.loadData();
    return this.statusByRegistrationAndName!.has(normalized);
  }
}
