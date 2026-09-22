import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createCachedBdfClient } from '../../services/integrations/bdf';

export const bdfRouter = Router();

const getClient = () => createCachedBdfClient();

bdfRouter.get(
  '/colture',
  asyncHandler(async (_req, res) => {
    const client = getClient();
    const data = await client.getColture();
    res.json({ status: 'success', data });
  }),
);

bdfRouter.get(
  '/tipologie',
  asyncHandler(async (_req, res) => {
    const client = getClient();
    const data = await client.getTipologie();
    res.json({ status: 'success', data });
  }),
);

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

bdfRouter.get(
  '/prodotti/:id',
  asyncHandler(async (req, res) => {
    const client = getClient();
    const data = await client.getProdottoDati(req.params.id);
    res.json({ status: 'success', data });
  }),
);

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

bdfRouter.get(
  '/sostanze-attive/:id',
  asyncHandler(async (req, res) => {
    const client = getClient();
    const data = await client.getSostanzaAttivaDati(req.params.id);
    res.json({ status: 'success', data });
  }),
);

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
