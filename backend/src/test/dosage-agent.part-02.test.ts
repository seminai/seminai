import { isObject, getString, getNumber, getBoolean, extractProductName, extractRegNumber } from '../infrastructure/services/agents/dosage_agent/typeGuards';
describe('Type Guards', () => {
  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('getString', () => {
    it('should extract string from object', () => {
      expect(getString({ name: 'test' }, 'name')).toBe('test');
    });

    it('should return fallback for missing key', () => {
      expect(getString({ name: 'test' }, 'missing', 'default')).toBe('default');
    });

    it('should return fallback for non-object input', () => {
      expect(getString(null, 'name', 'default')).toBe('default');
      expect(getString(undefined, 'name', 'default')).toBe('default');
      expect(getString('string', 'name', 'default')).toBe('default');
    });

    it('should trim string values', () => {
      expect(getString({ name: '  trimmed  ' }, 'name')).toBe('trimmed');
    });
  });

  describe('getNumber', () => {
    it('should extract number from object', () => {
      expect(getNumber({ value: 42 }, 'value')).toBe(42);
    });

    it('should parse string numbers', () => {
      expect(getNumber({ value: '42.5' }, 'value')).toBe(42.5);
    });

    it('should return fallback for NaN', () => {
      expect(getNumber({ value: 'not a number' }, 'value', -1)).toBe(-1);
    });

    it('should return fallback for missing key', () => {
      expect(getNumber({ value: 42 }, 'missing', -1)).toBe(-1);
    });
  });

  describe('getBoolean', () => {
    it('should extract boolean from object', () => {
      expect(getBoolean({ flag: true }, 'flag')).toBe(true);
      expect(getBoolean({ flag: false }, 'flag')).toBe(false);
    });

    it('should return fallback for non-boolean', () => {
      expect(getBoolean({ flag: 'true' }, 'flag', false)).toBe(false);
      expect(getBoolean({ flag: 1 }, 'flag', false)).toBe(false);
    });

    it('should return fallback for missing key', () => {
      expect(getBoolean({ flag: true }, 'missing', true)).toBe(true);
    });
  });

  describe('extractProductName', () => {
    it('should extract from productName field', () => {
      expect(extractProductName({ productName: 'Product A' })).toBe('Product A');
    });

    it('should extract from name field as fallback', () => {
      expect(extractProductName({ name: 'Product B' })).toBe('Product B');
    });

    it('should prefer productName over name', () => {
      expect(extractProductName({ productName: 'Product A', name: 'Product B' })).toBe('Product A');
    });

    it('should return empty string for missing fields', () => {
      expect(extractProductName({})).toBe('');
      expect(extractProductName(null)).toBe('');
    });
  });

  describe('extractRegNumber', () => {
    it('should extract from registrationNumber field', () => {
      expect(extractRegNumber({ registrationNumber: '12345' })).toBe('12345');
    });

    it('should extract from regNumber field as fallback', () => {
      expect(extractRegNumber({ regNumber: '54321' })).toBe('54321');
    });

    it('should prefer registrationNumber over regNumber', () => {
      expect(extractRegNumber({ registrationNumber: '12345', regNumber: '54321' })).toBe('12345');
    });

    it('should return empty string for missing fields', () => {
      expect(extractRegNumber({})).toBe('');
      expect(extractRegNumber(null)).toBe('');
    });
  });
});
