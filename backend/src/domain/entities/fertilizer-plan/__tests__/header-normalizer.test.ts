import { normalizeHeader } from '../header-normalizer';

describe('normalizeHeader', () => {
  it.each<[string, ReturnType<typeof normalizeHeader>]>([
    ['N', 'N'],
    ['n', 'N'],
    ['P2O5', 'P2O5'],
    ['P205', 'P2O5'],
    ['p2o5', 'P2O5'],
    ['K2O', 'K2O'],
    ['K20', 'K2O'],
    ['k20', 'K2O'],
    ['MgO', 'MgO'],
    ['mgo', 'MgO'],
    ['CaO', 'CaO'],
    ['Ca', 'CaO'],
    ['B Gramos/Ha', 'B'],
    ['B Gram/Ha', 'B'],
    ['B Grammi/Ha', 'B'],
    ['B', 'B'],
  ])('maps %j to %j', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });

  it.each<string>([
    // Italian (current dataset)
    'Giorni Dopo Semina',
    'Settimana',
    'Rapporto N:K N/(K2O/3.36)',
    'Rapporto Ca:Mg (1:0.5-0.25) (CaO/1.39)/MgO',
    // Spanish (legacy)
    'Día Después Siembra',
    'Dia Despues Siembra',
    'Semana',
    'Relación N:K N/(K2O/3.36)',
    // English
    'Day After Sowing',
    'Week',
    'Relation Ca:Mg (1:0.5) (CaO/1.39)/MgO',
    '',
    '   ',
  ])('returns null for metadata header %j', (header) => {
    expect(normalizeHeader(header)).toBeNull();
  });
});
