import { mapEpocaToApplicationDates } from '../infrastructure/services/agents/dosage_agent/bbchPhenologyMapper';
import { LabelDoseDetail } from '../domain/dtos/label.dto';

describe('BBCH Phenology Mapper', () => {
  describe('mapEpocaToApplicationDates', () => {
    it('should return null when epoca_impiego is empty', async () => {
      const dosageDetail: LabelDoseDetail = {
        coltura: 'orzo',
        epoca_impiego: '',
      };

      const result = await mapEpocaToApplicationDates(dosageDetail, 'orzo');
      expect(result).toBeNull();
    });

    it('should return null when epoca_impiego is null', async () => {
      const dosageDetail: LabelDoseDetail = {
        coltura: 'orzo',
        epoca_impiego: null,
      };

      const result = await mapEpocaToApplicationDates(dosageDetail, 'orzo');
      expect(result).toBeNull();
    });

    it('should return null when epoca_impiego is undefined', async () => {
      const dosageDetail: LabelDoseDetail = {
        coltura: 'orzo',
      };

      const result = await mapEpocaToApplicationDates(dosageDetail, 'orzo');
      expect(result).toBeNull();
    });

    // Integration tests (require LLM API key)
    // These tests are skipped by default - run with OPENAI_API_KEY set to test
    describe.skip('LLM integration tests', () => {
      it('should map "tre foglie vere" for orzo to autumn/winter dates', async () => {
        const dosageDetail: LabelDoseDetail = {
          coltura: 'orzo',
          epoca_impiego: 'tre foglie vere',
        };

        const result = await mapEpocaToApplicationDates(dosageDetail, 'orzo');

        expect(result).not.toBeNull();
        expect(result!.bbchStart).toBe(13);
        // For autumn-sown barley, BBCH 13 should be in Nov-Dec
        const startMonth = new Date(result!.startDate).getMonth();
        expect([10, 11]).toContain(startMonth); // November or December (0-indexed)
      });

      it('should map "tre foglie vere - secondo nodo" for orzo', async () => {
        const dosageDetail: LabelDoseDetail = {
          coltura: 'orzo',
          epoca_impiego: 'tre foglie vere - secondo nodo',
        };

        const result = await mapEpocaToApplicationDates(dosageDetail, 'orzo');

        expect(result).not.toBeNull();
        expect(result!.bbchStart).toBe(13);
        expect(result!.bbchEnd).toBe(32);
      });

      it('should map "fioritura" for vite', async () => {
        const dosageDetail: LabelDoseDetail = {
          coltura: 'vite',
          epoca_impiego: 'fioritura',
        };

        const result = await mapEpocaToApplicationDates(dosageDetail, 'vite');

        expect(result).not.toBeNull();
        expect(result!.bbchStart).toBeGreaterThanOrEqual(60);
        expect(result!.bbchEnd).toBeLessThanOrEqual(69);
      });

      it('should map "allegagione" for melo', async () => {
        const dosageDetail: LabelDoseDetail = {
          coltura: 'melo',
          epoca_impiego: 'allegagione',
        };

        const result = await mapEpocaToApplicationDates(dosageDetail, 'melo');

        expect(result).not.toBeNull();
        expect(result!.bbchStart).toBeGreaterThanOrEqual(69);
        expect(result!.bbchEnd).toBeLessThanOrEqual(75);
      });
    });
  });
});
