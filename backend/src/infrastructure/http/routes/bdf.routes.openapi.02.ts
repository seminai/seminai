export {};

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
