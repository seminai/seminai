export {};

/**
 * @swagger
 * /companies/{id}:
 *   put:
 *     summary: Aggiorna un'azienda
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
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
 *               name:
 *                 type: string
 *               vatNumber:
 *                 type: string
 *               fiscalCode:
 *                 type: string
 *               nation:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               cap:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               website:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Azienda aggiornata con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 *       409:
 *         description: Conflitto (VAT o Fiscal Code duplicato)
 */

/**
 * @swagger
 * /companies/{id}:
 *   delete:
 *     summary: Elimina un'azienda
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Azienda eliminata con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */

/**
 * @swagger
 * /companies/bulk/all:
 *   delete:
 *     summary: Elimina più aziende e tutti i dati correlati in bulk
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyIds
 *             properties:
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Aziende e tutti i dati correlati eliminati con successo
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 */

/**
 * @swagger
 * /companies/{id}/all:
 *   delete:
 *     summary: Elimina un'azienda e tutti i dati correlati (campi, unità produttive, prodotti, dosaggi, ecc.)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Azienda e tutti i dati correlati eliminati con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */

/**
 * @swagger
 * /companies/extract-from-csv:
 *   post:
 *     summary: Estrae dati azienda, campi e unità produttive da un file CSV/Excel
 *     description: Se companyId è fornito nel body, usa l'azienda esistente e salta l'estrazione company
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File CSV o Excel con dati catastali e colturali
 *               companyId:
 *                 type: string
 *                 description: (Opzionale) ID dell'azienda esistente. Se fornito, salta l'estrazione company e usa questa azienda
 *     responses:
 *       200:
 *         description: Dati estratti con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         vatNumber:
 *                           type: string
 *                         fiscalCode:
 *                           type: string
 *                         cuaa:
 *                           type: string
 *                         nation:
 *                           type: string
 *                         region:
 *                           type: string
 *                         city:
 *                           type: string
 *                         address:
 *                           type: string
 *                         cap:
 *                           type: string
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         fieldsCount:
 *                           type: number
 *                         productionUnitsCount:
 *                           type: number
 *       400:
 *         description: File mancante
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore di estrazione
 */

/**
 * @swagger
 * /companies/extract-from-visura:
 *   post:
 *     summary: Estrae i dati anagrafici di un'azienda da una visura camerale PDF
 *     description: Restituisce i dati estratti senza persisterli. L'utente li conferma con POST /companies.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Dati estratti dalla visura
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     extracted:
 *                       type: object
 *                       properties:
 *                         name: { type: string, nullable: true }
 *                         vatNumber: { type: string, nullable: true }
 *                         fiscalCode: { type: string, nullable: true }
 *                         address: { type: string, nullable: true }
 *                         city: { type: string, nullable: true }
 *                         cap: { type: string, nullable: true }
 *                         nation: { type: string, nullable: true }
 *                         email: { type: string, nullable: true }
 *                         phoneNumber: { type: string, nullable: true }
 *                         website: { type: string, nullable: true }
 *       400:
 *         description: File mancante o non valido
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore di estrazione
 */
