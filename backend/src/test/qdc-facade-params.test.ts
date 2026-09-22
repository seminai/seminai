import {
  parsePositiveInt,
  parseTipoScarico,
} from '../infrastructure/http/qdc-facade/qdc-facade-params';
import { AppError } from '../domain/errors/AppError';

describe('qdc-facade-params', () => {
  it('parses a positive integer from strings', () => {
    expect(parsePositiveInt('12', 'idAzienda')).toBe(12);
  });

  it('rejects non-positive integers', () => {
    expect(() => parsePositiveInt('0', 'idAzienda')).toThrow(AppError);
  });

  it('accepts a valid tipoScarico', () => {
    expect(parseTipoScarico('reso')).toBe('reso');
  });

  it('rejects an unknown tipoScarico', () => {
    expect(() => parseTipoScarico('dump')).toThrow(AppError);
  });
});
