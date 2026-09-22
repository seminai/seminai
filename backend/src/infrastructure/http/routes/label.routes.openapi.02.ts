export {};

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
 *                             description: Stable URL of the stored PDF
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
