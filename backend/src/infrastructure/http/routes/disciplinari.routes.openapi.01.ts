export {};

/**
 * @openapi
 * tags:
 *   - name: Disciplinari
 *     description: Estrazione dati da disciplinari di produzione integrata
 */

/**
 * @openapi
 * /disciplinari/extract-data-from-disciplinari:
 *   post:
 *     tags: [Disciplinari]
 *     summary: Estrae dati strutturati da file PDF di disciplinari in modo asincrono
 *     description: |
 *       Carica uno o più file PDF di disciplinari e crea un job di estrazione in background.
 *       Se un disciplinare è già stato estratto (stesso hash file) e non è scaduto, viene restituito dalla cache.
 *       Usa /disciplinari/job-status/:jobId per controllare il progresso.
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
 *                 description: File PDF dei disciplinari da processare
 *               concurrency:
 *                 type: integer
 *                 description: Numero massimo di richieste in parallelo (default 3)
 *               forceReExtract:
 *                 type: boolean
 *                 description: Forza la ri-estrazione anche se il disciplinare esiste già
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
 *                     filesQueued:
 *                       type: integer
 *                       description: Numero di file in coda
 *                     forceReExtract:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: Nessun file caricato o crediti insufficienti
 *       401:
 *         description: User ID non disponibile
 */

/**
 * @openapi
 * /disciplinari/job-status/{jobId}:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Controlla lo stato di un job di estrazione disciplinari
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

/**
 * @openapi
 * /disciplinari/summary:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Elenco riassuntivo dei disciplinari estratti
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
 *                       fileName:
 *                         type: string
 *                       region:
 *                         type: string
 *                       year:
 *                         type: integer
 *                       title:
 *                         type: string
 *                       validFrom:
 *                         type: string
 *                         format: date-time
 *                       validUntil:
 *                         type: string
 *                         format: date-time
 *                       isExpired:
 *                         type: boolean
 *                       extractionConfidence:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */

/**
 * @openapi
 * /disciplinari/expired:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Elenco disciplinari scaduti da aggiornare
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
 *                       fileName:
 *                         type: string
 *                       region:
 *                         type: string
 *                       year:
 *                         type: integer
 *                       title:
 *                         type: string
 *                       validUntil:
 *                         type: string
 *                         format: date-time
 *                       isExpired:
 *                         type: boolean
 */

/**
 * @openapi
 * /disciplinari/expiring-soon:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Elenco disciplinari in scadenza entro N giorni
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Numero di giorni entro cui scadranno
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /disciplinari/check-validity:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Verifica se un disciplinare è ancora valido
 *     parameters:
 *       - in: query
 *         name: region
 *         required: true
 *         schema:
 *           type: string
 *         description: Regione (es. "Emilia-Romagna")
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Anno (es. 2025)
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
 *                     exists:
 *                       type: boolean
 *                     isValid:
 *                       type: boolean
 *                     isExpired:
 *                       type: boolean
 *                     validUntil:
 *                       type: string
 *                       format: date-time
 *                     needsUpdate:
 *                       type: boolean
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 */
