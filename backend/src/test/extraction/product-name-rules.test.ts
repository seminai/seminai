import {
  isSectionHeaderOnlyDescription,
  normalizeProductName,
} from '../../infrastructure/services/extraction/product-name-rules';

describe('normalizeProductName — leading ADR / UN dangerous-goods stripping', () => {
  it.each([
    [
      "UN 3077 MATERIA PERICOLOSA PER L'AMBSOLIDA NAS (RAME) 9, III (E)PERICOLOSO PER L'AMBIENTE ALTACOR DA KG 0,1",
      'ALTACOR DA KG 0,1',
    ],
    [
      "UN3077 MATERIA PERICOLOSA PER L'AMBIENTESOLIDA, N.A.S., (CHLORANTRANILIPROLE), 9, III, INQUINANTE MARINO CHALLENGE DA LT 5",
      'CHALLENGE DA LT 5',
    ],
    [
      "UN 3082 MATERIA PERICOLOS PER L'AMBLIQUIDA NAS (ACLODIFEN) 9, IIIPERICOLOSO PER L'AMBIENTE SHELTER DA KG 0,5",
      'SHELTER DA KG 0,5',
    ],
    [
      "UN 3077 MATERIA PERICOLOSA PER L'AMB.SOLIDA NAS (CIMOXANIL) 9, IIIINQUINANTE MARINO/PERICOLOSO PER DANITRON DA LT 1",
      'DANITRON DA LT 1',
    ],
    [
      "UN3082 MATERIA PERICOLOSA PER L'AMBIENTELIQUIDA, N.O.S., (Fenpyroximate), 9, III EXECUTIVE GOLD DA GR 100",
      'EXECUTIVE GOLD DA GR 100',
    ],
    [
      "UN3077 MATERIA PERICOLOSA PER L'AMBIENTESOLIDA NAS (RIMSULFURON) 9, IIIINQUINANTE MARINO ETHREL DA LT 1",
      'ETHREL DA LT 1',
    ],
    [
      'UN 3265 LIQUIDO ORGANICO CORROSIVOACIDO NAS (ETEFON) 8, III MATACAR FL DA LT 0,2',
      'MATACAR FL DA LT 0,2',
    ],
  ])('strips ADR prefix from %s', (input, expected) => {
    expect(normalizeProductName(input)).toBe(expected);
  });

  it.each([
    'VECTOR DA LT 5',
    'SOLFATO AMMONICO 20,6 DA KG 25',
    'SONAVIO DA LT 5',
    'PERGADO SC DA LT 1',
    'POLTIGLIA DISPERSS DA KG 15',
  ])('leaves clean product names untouched: %s', (input) => {
    expect(normalizeProductName(input)).toBe(input);
  });
});

describe('normalizeProductName — Rif DT section-header stripping', () => {
  it.each([
    [
      'Rif DT n.1872 del 04/04/25\nCONC.ACTIVE LAND PLUS 10.8.15+3CaO+2MgO3 saccone\nKG.600',
      'CONC.ACTIVE LAND PLUS 10.8.15+3CaO+2MgO3 saccone KG.600',
    ],
    ['Rif DT n.2167 del 10/04/25\nADENGO XTRA SC485 LT.5-cip', 'ADENGO XTRA SC485 LT.5-cip'],
    [
      'Rif DT n.3006 del 02/05/25 CONC.NITRATO AMMONICO LINZER NAC27% saccone KG.600 Rif DT n.3380 del 08/05/25',
      'CONC.NITRATO AMMONICO LINZER NAC27% saccone KG.600',
    ],
    [
      'ALVERDE 240 SC LT.1-cip-ullilizzo az.30/06/26\nCOPIA STAMPATA DI FATTURA ELETTRONICA,\nNON VALIDA AI FINI FISCALI.',
      'ALVERDE 240 SC LT.1-cip-ullilizzo az.30/06/26',
    ],
    ['Rif. D.T. n. 763 del 01/03/25 SERCADIS SC LT.1', 'SERCADIS SC LT.1'],
  ])('strips Rif DT / footer noise from %j', (input, expected) => {
    expect(normalizeProductName(input)).toBe(expected);
  });
});

describe('isSectionHeaderOnlyDescription', () => {
  it.each([
    ['Rif DT n.763 del 01/03/25', true],
    ['Rif. D.T. n.1469 del 26/03/25', true],
    ['  Rif DT n.5840 del 29/07/25  ', true],
    [
      'Rif DT n.5840 del 29/07/25\nCOPIA STAMPATA DI FATTURA ELETTRONICA,\nNON VALIDA AI FINI FISCALI.',
      true,
    ],
    ['Rif DT n.763 del 01/03/25 SERCADIS SC LT.1-clp', false],
    ['SERCADIS SC LT.1-clp', false],
    ['', false],
  ])('returns %s for %j', (input, expected) => {
    expect(isSectionHeaderOnlyDescription(input)).toBe(expected);
  });
});
