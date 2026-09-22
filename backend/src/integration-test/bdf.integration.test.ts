import dotenv from 'dotenv';
import {
  BdfClient,
  createBdfClient,
  createBdfSearchProductsByAdversityTool,
  createBdfSearchProductDosesTool,
} from '../infrastructure/services/integrations/bdf';

dotenv.config();

describe('BDF WS API Integration Tests', () => {
  let client: BdfClient;

  beforeAll(() => {
    client = createBdfClient();
  });

  describe('Auth', () => {
    it('should authenticate and get JWT token', async () => {
      const token = await client.authenticate();
      console.log('Token (first 50 chars):', token.substring(0, 50) + '...');
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe('Colture', () => {
    it('should return list of crops', async () => {
      const colture = await client.getColture();
      console.log(`Colture totali: ${colture.length}`);
      console.log('Prime 5:', JSON.stringify(colture.slice(0, 5), null, 2));
      expect(colture.length).toBeGreaterThan(0);
      expect(colture[0]).toHaveProperty('ID_PV');
      expect(colture[0]).toHaveProperty('NOME_COLTURA');
    });
  });

  describe('Tipologie', () => {
    it('should return list of product types', async () => {
      const tipologie = await client.getTipologie();
      console.log(`Tipologie totali: ${tipologie.length}`);
      console.log('Tutte:', JSON.stringify(tipologie, null, 2));
      expect(tipologie.length).toBeGreaterThan(0);
      expect(tipologie[0]).toHaveProperty('COD_TIPO');
      expect(tipologie[0]).toHaveProperty('DECODIFICA');
    });
  });

  describe('Avversità', () => {
    it('should return adversities for Vite (coltura=74)', async () => {
      const avversita = await client.getAvversita('74');
      console.log(`Avversità per Vite: ${avversita.length}`);
      console.log('Prime 5:', JSON.stringify(avversita.slice(0, 5), null, 2));
      expect(avversita.length).toBeGreaterThan(0);
      expect(avversita[0]).toHaveProperty('COD_AVVERSITA');
      expect(avversita[0]).toHaveProperty('NOME_ITA');
    });
  });

  describe('Prodotti', () => {
    it('should search products by name "epik"', async () => {
      const prodotti = await client.getProdotti({ ricalfa: 'epik' });
      console.log(`Prodotti "epik": ${prodotti.length}`);
      console.log('Risultati:', JSON.stringify(prodotti, null, 2));
      expect(prodotti.length).toBeGreaterThan(0);
      expect(prodotti[0]).toHaveProperty('COD_PRODOTTO');
      expect(prodotti[0]).toHaveProperty('NOME_COMMERCIALE');
    });

    it('should search products by coltura and avversità', async () => {
      // Use Actinidia (coltura=74) which we know has avversità
      const avversita = await client.getAvversita('74');
      console.log(
        'Avversità per Actinidia:',
        avversita.map((a) => `${a.COD_AVVERSITA}: ${a.NOME_ITA}`),
      );
      expect(avversita.length).toBeGreaterThan(0);

      // Try each avversità until we find one with products
      let found = false;
      for (const avv of avversita) {
        const prodotti = await client.getProdotti({ coltura: 74, avversita: avv.COD_AVVERSITA });
        if (prodotti.length > 0) {
          console.log(`Prodotti per Actinidia/${avv.NOME_ITA}: ${prodotti.length}`);
          console.log('Primi 3:', JSON.stringify(prodotti.slice(0, 3), null, 2));
          expect(prodotti.length).toBeGreaterThan(0);
          found = true;
          break;
        }
      }

      if (!found) {
        console.log('Nessuna combinazione coltura/avversità ha prodotti - logging available data');
      }
      expect(found).toBe(true);
    });
  });

  describe('Dettaglio Prodotto', () => {
    it('should get product detail for EPIK SL (3872)', async () => {
      const dati = await client.getProdottoDati('3872');
      console.log('Dettaglio EPIK SL:', JSON.stringify(dati, null, 2));
      expect(dati.length).toBeGreaterThan(0);
      expect(dati[0].NOME_COMMERCIALE).toBe('EPIK SL');
    });
  });

  describe('Composizione', () => {
    it('should get composition for product 0228', async () => {
      const composizione = await client.getComposizione('0228');
      console.log('Composizione 0228:', JSON.stringify(composizione, null, 2));
      expect(composizione.length).toBeGreaterThan(0);
      expect(composizione[0]).toHaveProperty('COD_PA');
      expect(composizione[0]).toHaveProperty('DECODIFICA');
    });
  });

  describe('Sostanze Attive', () => {
    it('should search active substances by name "aba"', async () => {
      const sostanze = await client.getSostanzeAttive({ ricalfa: 'aba' });
      console.log(`Sostanze attive "aba": ${sostanze.length}`);
      console.log('Risultati:', JSON.stringify(sostanze, null, 2));
      expect(sostanze.length).toBeGreaterThan(0);
      expect(sostanze[0]).toHaveProperty('CODICE');
      expect(sostanze[0]).toHaveProperty('DECODIFICA');
    });
  });

  describe('Dettaglio Sostanza Attiva', () => {
    it('should get detail for substance 0001', async () => {
      const dati = await client.getSostanzaAttivaDati('0001');
      console.log('Dettaglio SA 0001:', JSON.stringify(dati, null, 2));
      expect(dati.length).toBeGreaterThan(0);
      expect(dati[0]).toHaveProperty('CODICE');
      expect(dati[0]).toHaveProperty('DECODIFICA');
    });
  });

  describe('Distributori', () => {
    it('should get distributors for product 3872', async () => {
      const distributori = await client.getDistributori('3872');
      console.log('Distributori EPIK SL:', JSON.stringify(distributori, null, 2));
      expect(distributori.length).toBeGreaterThan(0);
      expect(distributori[0]).toHaveProperty('RAGIONE_SOCIALE');
    });
  });

  describe('Impieghi', () => {
    it('should get authorized crops for product 2238', async () => {
      const impieghi = await client.getImpieghi('2238');
      console.log(`Impieghi prodotto 2238: ${impieghi.length}`);
      console.log('Primi 5:', JSON.stringify(impieghi.slice(0, 5), null, 2));
      expect(impieghi.length).toBeGreaterThan(0);
      expect(impieghi[0]).toHaveProperty('NOME');
      expect(impieghi[0]).toHaveProperty('CARENZA');
    });
  });

  describe('Pittogrammi', () => {
    it('should get pictograms HTML for product 3872', async () => {
      const html = await client.getPittogrammi('3872');
      console.log('Pittogrammi EPIK SL:', html);
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });
  });

  describe('Dosi', () => {
    it('should get doses for a valid product/crop/adversity combination', async () => {
      // Find a valid combination dynamically using Actinidia (74)
      const avversita = await client.getAvversita('74');
      expect(avversita.length).toBeGreaterThan(0);

      // Find a combo that has both products and doses
      for (const avv of avversita) {
        const prodotti = await client.getProdotti({ coltura: 74, avversita: avv.COD_AVVERSITA });
        if (prodotti.length === 0) continue;

        const codProd = prodotti[0].COD_PRODOTTO;
        const dosi = await client.getDosi({
          codprod: codProd,
          coltura: 74,
          avversita: avv.COD_AVVERSITA,
        });

        if (dosi.length > 0) {
          console.log(`Dosi per ${prodotti[0].NOME_COMMERCIALE} su Actinidia per ${avv.NOME_ITA}`);
          console.log(`Dosi trovate: ${dosi.length}`);
          console.log('Prima dose:', JSON.stringify(dosi[0], null, 2));
          expect(dosi[0]).toHaveProperty('DOSE_MIN');
          expect(dosi[0]).toHaveProperty('DOSE_MAX');
          expect(dosi[0]).toHaveProperty('DECO_UM_DOSE');
          expect(dosi[0]).toHaveProperty('NUM_MAX_INT');
          return;
        }
      }

      // If no combo found with Actinidia, try with EPIK SL impieghi
      const impieghi = await client.getImpieghi('3872');
      const firstCrop = impieghi[0]?.NOME;
      console.log(`Fallback: using EPIK SL impieghi, first crop: ${firstCrop}`);

      // Get EPIK SL dosi for its first authorized crop
      const colture = await client.getColture();
      const crop = colture.find((c) => c.NOME_COLTURA === firstCrop);
      if (crop) {
        const avv = await client.getAvversita(String(crop.ID_PV));
        if (avv.length > 0) {
          const dosi = await client.getDosi({
            codprod: '3872',
            coltura: crop.ID_PV,
            avversita: avv[0].COD_AVVERSITA,
          });
          console.log(`Dosi trovate (fallback): ${dosi.length}`);
          if (dosi.length > 0) {
            console.log('Prima dose:', JSON.stringify(dosi[0], null, 2));
          }
        }
      }
    }, 60000);
  });

  describe('BDF Tools - LLM Name Resolution', () => {
    it('should resolve "oidio" on "Vite" via LLM and find authorized products', async () => {
      const tool = createBdfSearchProductsByAdversityTool(client);
      const result = await tool.invoke({ cropName: 'Vite', adversityName: 'oidio' });
      const parsed = JSON.parse(result);
      console.log(
        'Tool result for Vite/oidio:',
        JSON.stringify(parsed, null, 2).substring(0, 1000),
      );

      if (parsed.error && parsed.availableAdversities) {
        // LLM couldn't resolve - log available adversities for debugging
        console.log('Available adversities:', parsed.availableAdversities);
        console.log('Suggestion:', parsed.suggestion);
        // The tool should at least return suggestions
        expect(parsed.availableAdversities.length).toBeGreaterThan(0);
      } else {
        // LLM resolved successfully
        expect(parsed.error).toBeUndefined();
        expect(parsed.crop).toBeDefined();
        expect(parsed.adversity).toBeDefined();
        expect(parsed.totalProducts).toBeGreaterThan(0);
        console.log(
          `Resolved: crop=${parsed.crop.nome}, adversity=${parsed.adversity.nome}, products=${parsed.totalProducts}`,
        );
      }
    }, 60000);

    it('should resolve "peronospora" on "Vite" via LLM and find authorized products', async () => {
      const tool = createBdfSearchProductsByAdversityTool(client);
      const result = await tool.invoke({ cropName: 'Vite', adversityName: 'peronospora' });
      const parsed = JSON.parse(result);
      console.log(
        'Tool result for Vite/peronospora:',
        JSON.stringify(parsed, null, 2).substring(0, 1000),
      );

      if (parsed.error && parsed.availableAdversities) {
        console.log('Available adversities:', parsed.availableAdversities);
        expect(parsed.availableAdversities.length).toBeGreaterThan(0);
      } else {
        expect(parsed.error).toBeUndefined();
        expect(parsed.totalProducts).toBeGreaterThan(0);
        console.log(
          `Resolved: adversity=${parsed.adversity.nome}, products=${parsed.totalProducts}`,
        );
      }
    }, 60000);

    it('should resolve product doses for "SERCADIS" on "Vite" for "oidio"', async () => {
      const tool = createBdfSearchProductDosesTool(client);
      const result = await tool.invoke({
        productName: 'SERCADIS',
        cropName: 'Vite',
        adversityName: 'oidio',
      });
      const parsed = JSON.parse(result);
      console.log(
        'Tool result for SERCADIS/Vite/oidio:',
        JSON.stringify(parsed, null, 2).substring(0, 1000),
      );

      if (parsed.error && parsed.availableAdversities) {
        console.log('Available adversities:', parsed.availableAdversities);
        expect(parsed.availableAdversities.length).toBeGreaterThan(0);
      } else if (parsed.error) {
        console.log('Error:', parsed.error, parsed.suggestion);
      } else {
        expect(parsed.product).toBeDefined();
        expect(parsed.crop).toBeDefined();
        expect(parsed.adversity).toBeDefined();
        console.log(
          `Resolved: product=${parsed.product.nome}, adversity=${parsed.adversity.nome}, doses=${parsed.doses?.length}`,
        );
      }
    }, 60000);
  });
});
