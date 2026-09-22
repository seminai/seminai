import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createCachedBdfClient } from '../../services/integrations/bdf';

export const bdfRouter = Router();

const getClient = () => createCachedBdfClient();

/**
 * @openapi
 * tags:
 *   - name: BDF
 *     description: Banca Dati Fitofarmaci - Database nazionale prodotti fitosanitari
 */

/**
 * @openapi
 * /bdf/colture:
 *   get:
 *     tags: [BDF]
 *     summary: Lista di tutte le colture
 *     responses:
 *       200:
 *         description: Lista colture
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ID_PV:
 *                     type: integer
 *                   NOME_COLTURA:
 *                     type: string
 */
bdfRouter.get(
  '/colture',
  asyncHandler(async (_req, res) => {
    const client = getClient();
    const data = await client.getColture();
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/tipologie:
 *   get:
 *     tags: [BDF]
 *     summary: Lista di tutte le tipologie di prodotto
 *     responses:
 *       200:
 *         description: Lista tipologie
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   COD_TIPO:
 *                     type: string
 *                   DECODIFICA:
 *                     type: string
 */
bdfRouter.get(
  '/tipologie',
  asyncHandler(async (_req, res) => {
    const client = getClient();
    const data = await client.getTipologie();
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/avversita:
 *   get:
 *     tags: [BDF]
 *     summary: Lista avversità per codice coltura
 *     parameters:
 *       - in: query
 *         name: coltura
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice della coltura (ID_PV)
 *         example: "74"
 *     responses:
 *       200:
 *         description: Lista avversità
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   COD_AVVERSITA:
 *                     type: string
 *                   NOME_ITA:
 *                     type: string
 *       400:
 *         description: Parametro coltura mancante
 */
bdfRouter.get(
  '/avversita',
  asyncHandler(async (req, res) => {
    const coltura = req.query.coltura as string;
    if (!coltura) {
      res.status(400).json({ status: 'error', message: 'Parametro coltura obbligatorio' });
      return;
    }
    const client = getClient();
    const data = await client.getAvversita(coltura);
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/prodotti:
 *   get:
 *     tags: [BDF]
 *     summary: Cerca prodotti per filtri
 *     parameters:
 *       - in: query
 *         name: ricalfa
 *         schema:
 *           type: string
 *         description: Ricerca alfabetica per nome (min 3 caratteri)
 *         example: "epik"
 *       - in: query
 *         name: coltura
 *         schema:
 *           type: integer
 *         description: Codice coltura
 *       - in: query
 *         name: avversita
 *         schema:
 *           type: string
 *         description: Codice avversità (richiede coltura)
 *       - in: query
 *         name: dettbio
 *         schema:
 *           type: boolean
 *         description: Solo prodotti biologici
 *       - in: query
 *         name: tipologia
 *         schema:
 *           type: string
 *         description: Codice tipologia
 *       - in: query
 *         name: codSA
 *         schema:
 *           type: string
 *         description: Codice sostanza attiva
 *     responses:
 *       200:
 *         description: Lista prodotti
 */
bdfRouter.get(
  '/prodotti',
  asyncHandler(async (req, res) => {
    const client = getClient();
    const data = await client.getProdotti({
      ricalfa: req.query.ricalfa as string | undefined,
      coltura: req.query.coltura ? Number(req.query.coltura) : undefined,
      avversita: req.query.avversita as string | undefined,
      dettbio: req.query.dettbio === 'true' ? true : undefined,
      tipologia: req.query.tipologia as string | undefined,
      codSA: req.query.codSA as string | undefined,
    });
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/prodotti/{id}:
 *   get:
 *     tags: [BDF]
 *     summary: Dettaglio singolo prodotto per codice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "3872"
 *     responses:
 *       200:
 *         description: Dettaglio prodotto
 */
bdfRouter.get(
  '/prodotti/:id',
  asyncHandler(async (req, res) => {
    const client = getClient();
    const data = await client.getProdottoDati(req.params.id);
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/sostanze-attive:
 *   get:
 *     tags: [BDF]
 *     summary: Cerca sostanze attive per filtri
 *     parameters:
 *       - in: query
 *         name: ricalfa
 *         schema:
 *           type: string
 *         description: Ricerca alfabetica per nome (min 3 caratteri)
 *         example: "aba"
 *       - in: query
 *         name: coltura
 *         schema:
 *           type: integer
 *         description: Codice coltura
 *       - in: query
 *         name: dettbio
 *         schema:
 *           type: boolean
 *         description: Solo biologiche
 *       - in: query
 *         name: tipologia
 *         schema:
 *           type: string
 *         description: Codice tipologia
 *       - in: query
 *         name: codSA
 *         schema:
 *           type: string
 *         description: Codice sostanza attiva
 *     responses:
 *       200:
 *         description: Lista sostanze attive
 */
bdfRouter.get(
  '/sostanze-attive',
  asyncHandler(async (req, res) => {
    const client = getClient();
    const data = await client.getSostanzeAttive({
      ricalfa: req.query.ricalfa as string | undefined,
      coltura: req.query.coltura ? Number(req.query.coltura) : undefined,
      dettbio: req.query.dettbio === 'true' ? true : undefined,
      tipologia: req.query.tipologia as string | undefined,
      codSA: req.query.codSA as string | undefined,
    });
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/sostanze-attive/{id}:
 *   get:
 *     tags: [BDF]
 *     summary: Dettaglio singola sostanza attiva per codice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice della sostanza attiva
 *         example: "0001"
 *     responses:
 *       200:
 *         description: Dettaglio sostanza attiva
 */
bdfRouter.get(
  '/sostanze-attive/:id',
  asyncHandler(async (req, res) => {
    const client = getClient();
    const data = await client.getSostanzaAttivaDati(req.params.id);
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/composizione:
 *   get:
 *     tags: [BDF]
 *     summary: Composizione per codice formulato commerciale
 *     parameters:
 *       - in: query
 *         name: codice
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "0228"
 *     responses:
 *       200:
 *         description: Composizione del prodotto
 *       400:
 *         description: Parametro codice mancante
 */
bdfRouter.get(
  '/composizione',
  asyncHandler(async (req, res) => {
    const codice = req.query.codice as string;
    if (!codice) {
      res.status(400).json({ status: 'error', message: 'Parametro codice obbligatorio' });
      return;
    }
    const client = getClient();
    const data = await client.getComposizione(codice);
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/impieghi:
 *   get:
 *     tags: [BDF]
 *     summary: Colture autorizzate per codice formulato commerciale
 *     parameters:
 *       - in: query
 *         name: codice
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "2238"
 *     responses:
 *       200:
 *         description: Lista colture autorizzate
 *       400:
 *         description: Parametro codice mancante
 */
bdfRouter.get(
  '/impieghi',
  asyncHandler(async (req, res) => {
    const codice = req.query.codice as string;
    if (!codice) {
      res.status(400).json({ status: 'error', message: 'Parametro codice obbligatorio' });
      return;
    }
    const client = getClient();
    const data = await client.getImpieghi(codice);
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/distributori:
 *   get:
 *     tags: [BDF]
 *     summary: Distributori per codice formulato commerciale
 *     parameters:
 *       - in: query
 *         name: codice
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "3872"
 *     responses:
 *       200:
 *         description: Lista distributori
 *       400:
 *         description: Parametro codice mancante
 */
bdfRouter.get(
  '/distributori',
  asyncHandler(async (req, res) => {
    const codice = req.query.codice as string;
    if (!codice) {
      res.status(400).json({ status: 'error', message: 'Parametro codice obbligatorio' });
      return;
    }
    const client = getClient();
    const data = await client.getDistributori(codice);
    res.json({ status: 'success', data });
  }),
);

/**
 * @openapi
 * /bdf/pittogrammi:
 *   get:
 *     tags: [BDF]
 *     summary: Pittogrammi per codice formulato commerciale (HTML)
 *     parameters:
 *       - in: query
 *         name: codice
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "3872"
 *     responses:
 *       200:
 *         description: HTML con pittogrammi
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: Parametro codice mancante
 */
bdfRouter.get(
  '/pittogrammi',
  asyncHandler(async (req, res) => {
    const codice = req.query.codice as string;
    if (!codice) {
      res.status(400).json({ status: 'error', message: 'Parametro codice obbligatorio' });
      return;
    }
    const client = getClient();
    const data = await client.getPittogrammi(codice);
    res.setHeader('Content-Type', 'text/html');
    res.send(data);
  }),
);

/**
 * @openapi
 * /bdf/dosi:
 *   get:
 *     tags: [BDF]
 *     summary: Dosi per prodotto/coltura/avversità
 *     parameters:
 *       - in: query
 *         name: codprod
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "3872"
 *       - in: query
 *         name: coltura
 *         required: true
 *         schema:
 *           type: integer
 *         description: Codice coltura
 *         example: 74
 *       - in: query
 *         name: avversita
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice avversità
 *         example: "00266"
 *       - in: query
 *         name: datatrattamento
 *         schema:
 *           type: string
 *           format: date
 *         description: Data trattamento (yyyy-mm-dd)
 *     responses:
 *       200:
 *         description: Lista dosi
 *       400:
 *         description: Parametri obbligatori mancanti
 */
bdfRouter.get(
  '/dosi',
  asyncHandler(async (req, res) => {
    const codprod = req.query.codprod as string;
    const coltura = req.query.coltura as string;
    const avversita = req.query.avversita as string;

    if (!codprod || !coltura || !avversita) {
      res.status(400).json({
        status: 'error',
        message: 'Parametri codprod, coltura e avversita obbligatori',
      });
      return;
    }

    const client = getClient();
    const data = await client.getDosi({
      codprod,
      coltura: Number(coltura),
      avversita,
      datatrattamento: req.query.datatrattamento as string | undefined,
    });
    res.json({ status: 'success', data });
  }),
);
