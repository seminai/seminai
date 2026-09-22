import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ScrapeGraphController } from '../controllers/ScrapeGraphController';

export const scrapegraphRouter = Router();
const controller = new ScrapeGraphController();

/**
 * @openapi
 * tags:
 *   - name: ScrapeGraph
 *     description: Web scraping AI-powered per estrazione dati da disciplinari
 */

/**
 * @openapi
 * /scrapegraph/extract:
 *   post:
 *     tags: [ScrapeGraph]
 *     summary: Estrae dati strutturati da un URL di disciplinare usando ScrapeGraph AI
 *     description: |
 *       Usa l'API ScrapeGraph AI per estrarre dati strutturati da pagine web di disciplinari.
 *       La categoria viene rilevata automaticamente dall'URL se non specificata.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL della pagina web del disciplinare
 *                 example: "https://agricoltura.regione.emilia-romagna.it/disciplinari/2025/difesa"
 *               region:
 *                 type: string
 *                 description: Hint regione (opzionale)
 *                 example: "Emilia-Romagna"
 *               year:
 *                 type: integer
 *                 description: Hint anno (opzionale)
 *                 example: 2025
 *               category:
 *                 type: string
 *                 enum: [metadata, rules, defense_targets, interventions, scope_entities]
 *                 description: |
 *                   Categoria di dati da estrarre:
 *                   - metadata: Metadati documento (regione, anno, validità)
 *                   - rules: Regole, principi, divieti
 *                   - defense_targets: Avversità e interventi ammessi
 *                   - interventions: Prodotti, dosi, limiti
 *                   - scope_entities: Colture, sezioni
 *               saveToDatabase:
 *                 type: boolean
 *                 default: false
 *                 description: Salva i dati estratti nel database
 *     responses:
 *       200:
 *         description: Estrazione completata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: string
 *                       description: Categoria estratta
 *                     confidence:
 *                       type: integer
 *                       description: Confidenza dell'estrazione (0-100)
 *                     sourceUrl:
 *                       type: string
 *                     databaseId:
 *                       type: string
 *                       description: ID nel database (se saveToDatabase=true)
 *                     extractedData:
 *                       type: object
 *                       description: Dati strutturati estratti
 *       400:
 *         description: URL mancante o non valido
 *       422:
 *         description: Estrazione fallita
 */
scrapegraphRouter.post(
  '/extract',
  ensureAuthenticated,
  asyncHandler(async (req, res) => controller.extractFromUrl(req, res)),
);

/**
 * @openapi
 * /scrapegraph/batch:
 *   post:
 *     tags: [ScrapeGraph]
 *     summary: Estrae dati da multipli URL in batch
 *     description: |
 *       Processa fino a 10 URL in parallelo.
 *       Ogni URL può avere una categoria specificata.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [urls]
 *             properties:
 *               urls:
 *                 type: array
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   required: [url]
 *                   properties:
 *                     url:
 *                       type: string
 *                       format: uri
 *                     category:
 *                       type: string
 *                       enum: [metadata, rules, defense_targets, interventions, scope_entities]
 *               saveToDatabase:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Batch completato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 */
scrapegraphRouter.post(
  '/batch',
  ensureAuthenticated,
  asyncHandler(async (req, res) => controller.batchExtract(req, res)),
);

/**
 * @openapi
 * /scrapegraph/categories:
 *   get:
 *     tags: [ScrapeGraph]
 *     summary: Elenco categorie di estrazione supportate
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           value:
 *                             type: string
 *                           description:
 *                             type: string
 */
scrapegraphRouter.get(
  '/categories',
  asyncHandler(async (req, res) => controller.getCategories(req, res)),
);
