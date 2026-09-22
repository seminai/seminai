export {};

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
