import { FitosanitariLookupService } from '../infrastructure/services/utils/FitosanitariLookupService';

describe('FitosanitariLookupService', () => {
  beforeEach(() => {
    (
      FitosanitariLookupService as unknown as { instance: FitosanitariLookupService | null }
    ).instance = null;
  });

  it('should return administrative status only when registration and name both match', () => {
    const service = FitosanitariLookupService.getInstance() as unknown as {
      statusByRegistrationAndName: Map<string, Map<string, string>>;
      lookupStatus: (
        registrationNumber: string | null | undefined,
        productName: string | null | undefined,
      ) => string | null;
    };
    service.statusByRegistrationAndName = new Map([
      ['1', new Map([['ABION E', 'Revocato']])],
      ['3741', new Map([['RAME 20 WG', 'Valido']])],
    ]);

    const status = service.lookupStatus('000001', '  abion   e ');

    expect(status).toBe('Revocato');
  });

  it('should fallback to registration number when name does not match', () => {
    const service = FitosanitariLookupService.getInstance() as unknown as {
      statusByRegistrationAndName: Map<string, Map<string, string>>;
      lookupStatus: (
        registrationNumber: string | null | undefined,
        productName: string | null | undefined,
      ) => string | null;
    };
    service.statusByRegistrationAndName = new Map([['1', new Map([['ABION E', 'Revocato']])]]);

    // Registration number matches but name doesn't → fallback to first entry
    expect(service.lookupStatus('000001', 'Prodotto Diverso')).toBe('Revocato');

    // Registration number doesn't match → null
    expect(service.lookupStatus('000099', 'Abion E')).toBeNull();

    // Null registration number → null
    expect(service.lookupStatus(null, 'Abion E')).toBeNull();

    // Registration number matches but no name provided → fallback
    expect(service.lookupStatus('000001', null)).toBe('Revocato');
  });
});
