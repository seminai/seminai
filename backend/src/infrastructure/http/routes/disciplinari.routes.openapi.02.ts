export {};

/**
 * @openapi
 * /disciplinari/search:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Cerca disciplinari per regione e anno
 *     parameters:
 *       - in: query
 *         name: region
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /disciplinari/stats:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Statistiche sulle estrazioni disciplinari
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
 *                     total:
 *                       type: integer
 *                     expired:
 *                       type: integer
 *                     valid:
 *                       type: integer
 *                     avgConfidence:
 *                       type: number
 *                     byRegion:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           region:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     byYear:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: integer
 *                           count:
 *                             type: integer
 */

/**
 * @openapi
 * /disciplinari/update-expired-status:
 *   post:
 *     tags: [Disciplinari]
 *     summary: Aggiorna lo stato isExpired per tutti i disciplinari scaduti
 *     description: Dovrebbe essere chiamato da un job schedulato
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /disciplinari/bulk:
 *   delete:
 *     tags: [Disciplinari]
 *     summary: Elimina in bulk estrazioni disciplinari per lista di id
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
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /disciplinari/{id}:
 *   get:
 *     tags: [Disciplinari]
 *     summary: Dettaglio estrazione disciplinare per id
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
 *   delete:
 *     tags: [Disciplinari]
 *     summary: Elimina un'estrazione disciplinare per id
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
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 */
