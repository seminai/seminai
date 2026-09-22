export {};

/**
 * @swagger
 * /companies/create-with-data:
 *   post:
 *     summary: Crea un'azienda con campi e unità produttive in una singola operazione
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
 *               - company
 *             properties:
 *               company:
 *                 type: object
 *                 required:
 *                   - name
 *                 properties:
 *                   name:
 *                     type: string
 *                   vatNumber:
 *                     type: string
 *                   fiscalCode:
 *                     type: string
 *                   cuaa:
 *                     type: string
 *                   nation:
 *                     type: string
 *                   region:
 *                     type: string
 *                   city:
 *                     type: string
 *                   address:
 *                     type: string
 *                   cap:
 *                     type: string
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *               productionUnits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     areaHa:
 *                       type: number
 *                     cycles:
 *                       type: array
 *                       items:
 *                         type: object
 *     responses:
 *       201:
 *         description: Azienda creata con tutti i dati
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
 *                     createdFieldsCount:
 *                       type: number
 *                     createdProductionUnitsCount:
 *                       type: number
 *                     message:
 *                       type: string
 *       400:
 *         description: Dati mancanti
 *       401:
 *         description: Non autorizzato
 */
