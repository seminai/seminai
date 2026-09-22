import { toTitleCase } from '../string.util';

describe('toTitleCase', () => {
  it.each([
    ['AGIL', 'Agil'],
    ['agil', 'Agil'],
    ['Agil', 'Agil'],
    ['  affirm  opti  ', 'Affirm Opti'],
    ['', ''],
    ['   ', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(toTitleCase(input)).toBe(expected);
  });
});
