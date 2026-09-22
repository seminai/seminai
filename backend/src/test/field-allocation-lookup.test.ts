import type { Field } from '../domain/entities/Field';
import { buildFieldAllocationLookup } from '../application/use-cases/bulk-import/field-allocation-lookup';

describe('buildFieldAllocationLookup', () => {
  it('uses explicit field id before cadastral matching', () => {
    const lookup = buildFieldAllocationLookup(
      [
        makeField('field-a', 'ARCOLE - F9 P404', '9', '404', 'company-1'),
        makeField('field-b', 'VERONELLA - F9 P404', '9', '404', 'company-1'),
      ],
      'company-1',
    );
    const actual = lookup.resolve({
      fieldId: 'field-b',
      fieldName: 'VERONELLA - F9 P404',
      foglio: '9',
      particella: '404',
      areaHa: 1,
    });
    expect(actual).toEqual({ status: 'found', fieldId: 'field-b' });
  });

  it('uses municipality to disambiguate cadastral references', () => {
    const lookup = buildFieldAllocationLookup(
      [
        makeField('field-a', 'ARCOLE - F9 P404', '9', '404', 'company-1', 'ARCOLE'),
        makeField('field-b', 'VERONELLA - F9 P404', '9', '404', 'company-1', 'VERONELLA'),
      ],
      'company-1',
    );
    const actual = lookup.resolve({
      fieldName: 'VERONELLA - F9 P404',
      comune: 'VERONELLA',
      foglio: '9',
      particella: '404',
      areaHa: 1,
    });
    expect(actual).toEqual({ status: 'found', fieldId: 'field-b' });
  });

  it('rejects ambiguous cadastral fallback before field-name hints', () => {
    const lookup = buildFieldAllocationLookup(
      [
        makeField('field-a', 'ARCOLE - F9 P404', '9', '404', 'company-1'),
        makeField('field-b', 'VERONELLA - F9 P404', '9', '404', 'company-1'),
      ],
      'company-1',
    );
    const actual = lookup.resolve({
      fieldName: 'Missing exact name',
      foglio: '9',
      particella: '404',
      areaHa: 1,
    });
    expect(actual).toEqual({ status: 'ambiguous' });
  });
});

function makeField(
  id: string,
  name: string,
  foglio: string,
  particella: string,
  companyId: string,
  city: string | null = null,
): Field {
  return {
    id,
    name,
    foglio,
    particella,
    companyId,
    sezione: null,
    subalterno: null,
    city,
  } as unknown as Field;
}
