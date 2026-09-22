import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureUserRole } from '../middlewares/ensureUserRole';
import { bulkExtractRateLimiter } from '../middlewares/rateLimiter';
import { LabelController } from '../controllers/LabelController';
import { getLinkLabelSian } from '../../services/scraper/getLinkLabelSian';
import { upload } from '../../services/Multer';
import { LABEL_MODIFY_ROLES } from '../../../domain/constants/label-roles';

export const labelRouter = Router();
const controller = new LabelController();

/**
 * @openapi
 * tags:
 *   - name: Labels
 *     description: Estrazione etichette fitosanitarie
 * components:
 *   schemas:
 *     LabelDoseDetail:
 *       type: object
 *       properties:
 *         coltura:
 *           type: string
 *         malattia:
 *           type: string
 *           nullable: true
 *         dose_minima:
 *           type: number
 *           nullable: true
 *           description: Valore minimo del dosaggio (es. 1 in "1-3 kg/ha")
 *         dose_massima:
 *           type: number
 *           nullable: true
 *           description: Valore massimo del dosaggio (es. 3 in "1-3 kg/ha")
 *         dose_um:
 *           type: string
 *           nullable: true
 *         acqua_max:
 *           type: number
 *           nullable: true
 *         acqua_max_um:
 *           type: string
 *           nullable: true
 *         n_max_applicazioni:
 *           type: integer
 *           format: int32
 *           description: Se assente non includere il campo
 *         n_max_applicazioni_um:
 *           type: string
 *           description: Se assente non includere il campo
 *         intervallo_min_giorni:
 *           type: integer
 *           format: int32
 *           nullable: true
 *         intervallo_sicurezza_giorni:
 *           type: integer
 *           format: int32
 *           nullable: true
 *         epoca_impiego:
 *           type: string
 *           nullable: true
 *         modalita_applicazione:
 *           type: string
 *           nullable: true
 *         istruzioni:
 *           type: string
 *           nullable: true
 *     Label:
 *       type: object
 *       properties:
 *         prodotto:
 *           type: string
 *           nullable: true
 *         categoria:
 *           type: string
 *           nullable: true
 *         formulazione:
 *           type: string
 *           nullable: true
 *         principio_attivo:
 *           type: string
 *           nullable: true
 *         composizione:
 *           type: string
 *           nullable: true
 *         meccanismo_azione_frac:
 *           type: string
 *           nullable: true
 *         malattie:
 *           type: array
 *           items:
 *             type: string
 *         specie:
 *           type: array
 *           items:
 *             type: string
 *         colture_target:
 *           type: array
 *           items:
 *             type: string
 *         dosaggi_dettagliati:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/LabelDoseDetail'
 *         fasce_di_rispetto_e_deriva:
 *           type: array
 *           items:
 *             type: string
 *         avvertenze:
 *           type: array
 *           items:
 *             type: string
 *         frasi_pericolo:
 *           type: array
 *           items:
 *             type: string
 *         frasi_prudenza:
 *           type: array
 *           items:
 *             type: string
 *         compatibilita:
 *           type: string
 *           nullable: true
 *         fitotossicita:
 *           type: string
 *           nullable: true
 *         note_tecniche:
 *           type: string
 *           nullable: true
 *         extraction_confidence:
 *           type: integer
 *           format: int32
 *         extracted_fields:
 *           type: array
 *           items:
 *             type: string
 *         errors:
 *           type: array
 *           items:
 *             type: string
 *         numero_registrazione:
 *           type: string
 *           nullable: true
 *         titolare:
 *           type: string
 *           nullable: true
 *         stabilimento:
 *           type: string
 *           nullable: true
 *         caratteristiche:
 *           type: string
 *           nullable: true
 */

/**
 * @openapi
 * /labels/extract:
 *   get:
 *     tags: [Labels]
 *     summary: Estrae e struttura l'etichetta SIAN in JSON
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome commerciale del prodotto
 *       - in: query
 *         name: regNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Numero di registrazione del prodotto
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
 *                     url:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     text:
 *                       type: string
 *       400:
 *         description: Missing required query params
 *       404:
 *         description: Label not found or text not extractable
 */
labelRouter.get(
  '/extract',
  asyncHandler(async (req, res) => controller.extract(req, res)),
);

/**
 * @openapi
 * /labels/extract-sian:
 *   get:
 *     tags: [Labels]
 *     summary: Recupera solo il link PDF SIAN dato prodotto e registrazione
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: regNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     regNumber:
 *                       type: string
 *                     name:
 *                       type: string
 *       400:
 *         description: Missing required query params
 */
labelRouter.get(
  '/extract-sian',
  asyncHandler(async (req, res) => {
    const rawName = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name;
    const rawRegNumber = Array.isArray(req.query.regNumber)
      ? req.query.regNumber[0]
      : req.query.regNumber;
    const rawUserId = Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId;

    const name: string = (rawName ?? '').toString().trim();
    const regNumber: string = (rawRegNumber ?? '').toString().trim();
    const userId: string = (rawUserId ?? '').toString().trim();

    if (!name || !regNumber || !userId) {
      res.status(400).json({ message: 'Missing required query params: name, regNumber, userId' });
      return;
    }

    const result = await getLinkLabelSian({ name, regNumber, userId });
    res.json({ data: result });
  }),
);

/**
 * @openapi
 * /labels/bulk-extract:
 *   post:
 *     tags: [Labels]
 *     summary: Esegue estrazione etichette SIAN in bulk con caching su Prisma
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ items ]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [ name, regNumber ]
 *                   properties:
 *                     name:
 *                       type: string
 *                     regNumber:
 *                       type: string
 *               concurrency:
 *                 type: integer
 *                 description: Numero massimo di richieste in parallelo (default 2)
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Body malformato
 */
labelRouter.post(
  '/bulk-extract',
  asyncHandler(async (req, res) => controller.bulkExtract(req, res)),
);

/**
 * @openapi
 * /labels/bulk-pdf-label:
 *   post:
 *     tags: [Labels]
 *     summary: Esegue estrazione etichette da file PDF caricati (senza scraping SIAN, estrae automaticamente nome e numero registrazione dal PDF)
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: File PDF delle etichette da processare
 *               concurrency:
 *                 type: integer
 *                 description: Numero massimo di richieste in parallelo (default 5)
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
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fileName:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [ extracted, failed ]
 *                           name:
 *                             type: string
 *                             description: Nome prodotto estratto automaticamente dal PDF
 *                           regNumber:
 *                             type: string
 *                             description: Numero registrazione estratto automaticamente dal PDF
 *                           bucketUrl:
 *                             type: string
 *                             description: URL del PDF caricato nel bucket GCS
 *                           label:
 *                             $ref: '#/components/schemas/Label'
 *                           error:
 *                             type: string
 *                 cost:
 *                   type: object
 *       400:
 *         description: Nessun file caricato o body malformato
 *       401:
 *         description: User ID non disponibile
 */
// Rate limit: 5 richieste/minuto per utente
labelRouter.post(
  '/bulk-pdf-label',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFiles(req, res)),
);

/**
 * @openapi
 * /labels/bulk-pdf-label-async:
 *   post:
 *     tags: [Labels]
 *     summary: Esegue estrazione etichette da file PDF in modo asincrono (ritorna jobId immediatamente)
 *     description: Carica i file e crea un job in background. Usa /labels/job-status/:jobId per controllare il progresso. L'utente deve avere crediti sufficienti per eseguire l'operazione.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: File PDF delle etichette da processare
 *               concurrency:
 *                 type: integer
 *                 description: Numero massimo di richieste in parallelo (default 5)
 *     responses:
 *       200:
 *         description: Job creato con successo
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
 *                     jobId:
 *                       type: string
 *                       description: ID del job per controllare lo stato
 *                     message:
 *                       type: string
 *       400:
 *         description: Nessun file caricato o crediti insufficienti
 *       401:
 *         description: User ID non disponibile
 */
// Rate limit: 5 richieste/minuto per utente
labelRouter.post(
  '/bulk-pdf-label-async',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFilesAsync(req, res)),
);

/**
 * @openapi
 * /labels/bulk-pdf-label-fertilizer-async:
 *   post:
 *     tags: [Labels]
 *     summary: Esegue estrazione etichette fertilizzanti da file PDF in modo asincrono (ritorna jobId immediatamente)
 *     description: Carica i file e crea un job in background per fertilizzanti. Usa /labels/job-status/:jobId per controllare il progresso.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: File PDF delle etichette fertilizzanti
 *               concurrency:
 *                 type: integer
 *                 description: Numero massimo di richieste in parallelo (default 5)
 *     responses:
 *       200:
 *         description: Job creato con successo
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
 *                     jobId:
 *                       type: string
 *                       description: ID del job per controllare lo stato
 *                     message:
 *                       type: string
 *       400:
 *         description: Nessun file caricato o crediti insufficienti
 *       401:
 *         description: User ID non disponibile
 */
// Rate limit: 5 richieste/minuto per utente
labelRouter.post(
  '/bulk-pdf-label-fertilizer-async',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFilesFertilizerAsync(req, res)),
);

/**
 * @openapi
 * /labels/job-status/{jobId}:
 *   get:
 *     tags: [Labels]
 *     summary: Controlla lo stato di un job di estrazione asincrono
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del job
 *     responses:
 *       200:
 *         description: Stato del job
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
 *                     id:
 *                       type: string
 *                     state:
 *                       type: string
 *                       enum: [waiting, active, completed, failed]
 *                     progress:
 *                       type: number
 *                       description: Percentuale di completamento (0-100)
 *                     result:
 *                       type: object
 *                       description: Risultato finale (disponibile solo quando state=completed)
 *                     failedReason:
 *                       type: string
 *                       description: Motivo del fallimento (disponibile solo quando state=failed)
 *       404:
 *         description: Job non trovato
 */
labelRouter.get(
  '/job-status/:jobId',
  asyncHandler(async (req, res) => controller.getJobStatus(req, res)),
);

/**
 * @openapi
 * /labels/export-csv:
 *   get:
 *     tags: [Labels]
 *     summary: Esporta tutte le etichette in CSV, una riga per ciascun dosaggio dettagliato
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
 *                     filePath:
 *                       type: string
 */
labelRouter.get(
  '/export-csv',
  asyncHandler(async (req, res) => controller.exportCsv(req, res)),
);

/**
 * @openapi
 * /labels/summary:
 *   get:
 *     tags: [Labels]
 *     summary: Elenco riassuntivo delle etichette disponibili
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       productName:
 *                         type: string
 *                       registrationNumber:
 *                         type: string
 *                       extractionConfidence:
 *                         type: integer
 *                       isVerified:
 *                         type: boolean
 *                       qualityExtraction:
 *                         type: array
 *                         items:
 *                           type: number
 *                       errors:
 *                         type: array
 *                         items:
 *                           type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
labelRouter.get(
  '/summary',
  asyncHandler(async (req, res) => controller.listSummary(req, res)),
);

/**
 * @openapi
 * /labels/bdf-label-detail:
 *   get:
 *     tags: [Labels]
 *     summary: Restituisce il dettaglio etichetta dal dataset BDF locale
 *     parameters:
 *       - in: query
 *         name: productName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: registrationNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Missing productName or registrationNumber
 *       404:
 *         description: Label non trovata nel dataset BDF
 */
labelRouter.get(
  '/bdf-label-detail',
  asyncHandler(async (req, res) => controller.getBdfLabelDetail(req, res)),
);

/**
 * @openapi
 * /labels/bdf-label-list:
 *   get:
 *     tags: [Labels]
 *     summary: Elenco di productName e registrationNumber disponibili nel dataset BDF
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productName:
 *                         type: string
 *                       registrationNumber:
 *                         type: string
 */
labelRouter.get(
  '/bdf-label-list',
  asyncHandler(async (req, res) => controller.listBdfLabelPairs(req, res)),
);

/**
 * @openapi
 * /labels/by-product:
 *   get:
 *     tags: [Labels]
 *     summary: Dettaglio etichetta per nome prodotto e numero di registrazione
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: regNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Missing name or regNumber
 *       404:
 *         description: Label not found
 */
labelRouter.get(
  '/by-product',
  asyncHandler(async (req, res) => controller.getByProductAndRegistration(req, res)),
);

/**
 * @openapi
 * /labels/{id}:
 *   get:
 *     tags: [Labels]
 *     summary: Dettaglio etichetta per id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 *   put:
 *     tags: [Labels]
 *     summary: Aggiorna un'etichetta esistente per id
 *     description: Richiede ruolo ADMIN o LABEL_MANAGER
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productName:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               sourceUrl:
 *                 type: string
 *               label:
 *                 $ref: '#/components/schemas/Label'
 *               rawText:
 *                 type: string
 *               extractionConfidence:
 *                 type: integer
 *               extractedFields:
 *                 type: array
 *                 items:
 *                   type: string
 *               errors:
 *                 type: array
 *                 items:
 *                   type: string
 *               qualityExtraction:
 *                 type: array
 *                 items:
 *                   type: number
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 */
labelRouter.get(
  '/:id',
  asyncHandler(async (req, res) => controller.getById(req, res)),
);

labelRouter.put(
  '/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.update(req, res)),
);

/**
 * @openapi
 * /labels/verify-label/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Aggiorna lo stato di verifica di un'etichetta
 *     description: Richiede ruolo ADMIN o LABEL_MANAGER
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ isVerified ]
 *             properties:
 *               isVerified:
 *                 type: boolean
 *                 description: Stato di verifica dell'etichetta
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o isVerified non valido
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 */
labelRouter.post(
  '/verify-label/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.verifyLabel(req, res)),
);

/**
 * @openapi
 * /labels/update-label/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Aggiorna un'etichetta ri-estraendo i dati dal rawText esistente
 *     description: Legge il rawText dell'etichetta esistente e sovrascrive i dati estratti con una nuova estrazione. Richiede ruolo ADMIN o LABEL_MANAGER.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dell'etichetta da aggiornare
 *     responses:
 *       200:
 *         description: Etichetta aggiornata con successo
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o rawText vuoto
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 */
labelRouter.post(
  '/update-label/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.updateLabel(req, res)),
);

/**
 * @openapi
 * /labels/extract-with-mistral/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Ri-estrae i dati di un'etichetta usando SOLO Mistral LLM
 *     description: Legge il rawText dell'etichetta esistente e sovrascrive i dati estratti usando esclusivamente Mistral come modello di estrazione. Richiede ruolo ADMIN o LABEL_MANAGER.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dell'etichetta da ri-estrarre con Mistral
 *     responses:
 *       200:
 *         description: Etichetta ri-estratta con successo usando Mistral
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o rawText vuoto
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 *       500:
 *         description: MISTRAL_API_KEY non configurata
 */
labelRouter.post(
  '/extract-with-mistral/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.extractLabelWithMistral(req, res)),
);

/**
 * @openapi
 * /labels/extract-with-gpt/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Ri-estrae i dati di un'etichetta usando GPT-4o Vision con immagini ad alta risoluzione
 *     description: |
 *       Scarica il PDF dall'URL sorgente, lo elabora con GPT-4o Vision per estrarre testo e tabelle
 *       con alta precisione. Utilizza il testo già estratto con pdfToText come contesto per migliorare
 *       l'estrazione. Sovrascrive rawText con il testo migliorato e ri-estrae i dati strutturati.
 *       Richiede ruolo ADMIN o LABEL_MANAGER.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dell'etichetta da ri-estrarre con GPT Vision
 *     responses:
 *       200:
 *         description: Etichetta ri-estratta con successo usando GPT Vision
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                       description: Testo migliorato estratto con GPT Vision
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o sourceUrl vuota
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 *       500:
 *         description: OPENAI_API_KEY non configurata
 */
labelRouter.post(
  '/extract-with-gpt/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.extractLabelWithGpt(req, res)),
);

/**
 * @openapi
 * /labels/bulk:
 *   delete:
 *     tags: [Labels]
 *     summary: Elimina in bulk etichette per lista di id
 *     description: Richiede ruolo ADMIN o LABEL_MANAGER
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ ids ]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
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
 *                     deleted:
 *                       type: integer
 *       400:
 *         description: Body malformato
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 */
labelRouter.delete(
  '/bulk',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.bulkDelete(req, res)),
);

/**
 * @openapi
 * /labels/{id}/history:
 *   get:
 *     tags: [Labels]
 *     summary: Get label modification history
 *     description: Returns all modification history entries for a label, including user info
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Label history retrieved successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
labelRouter.get(
  '/:id/history',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.getLabelHistory(req, res)),
);

/**
 * @openapi
 * /labels/rollback/{historyId}:
 *   post:
 *     tags: [Labels]
 *     summary: Rollback a label to a previous state
 *     description: Restores a label to the state captured in a history entry. The rollback itself is recorded as a new history entry.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Label rolled back successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: History entry or label not found
 */
labelRouter.post(
  '/rollback/:historyId',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.rollbackLabel(req, res)),
);
