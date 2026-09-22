export {};

/**
 * @openapi
 * tags:
 *   - name: BDF
 *     description: Banca Dati Fitofarmaci - Database nazionale prodotti fitosanitari
 */

/**
 * @openapi
 * /bdf/colture:
 *   get:
 *     tags: [BDF]
 *     summary: Lista di tutte le colture
 *     responses:
 *       200:
 *         description: Lista colture
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ID_PV:
 *                     type: integer
 *                   NOME_COLTURA:
 *                     type: string
 */

/**
 * @openapi
 * /bdf/tipologie:
 *   get:
 *     tags: [BDF]
 *     summary: Lista di tutte le tipologie di prodotto
 *     responses:
 *       200:
 *         description: Lista tipologie
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   COD_TIPO:
 *                     type: string
 *                   DECODIFICA:
 *                     type: string
 */

/**
 * @openapi
 * /bdf/avversita:
 *   get:
 *     tags: [BDF]
 *     summary: Lista avversità per codice coltura
 *     parameters:
 *       - in: query
 *         name: coltura
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice della coltura (ID_PV)
 *         example: "74"
 *     responses:
 *       200:
 *         description: Lista avversità
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   COD_AVVERSITA:
 *                     type: string
 *                   NOME_ITA:
 *                     type: string
 *       400:
 *         description: Parametro coltura mancante
 */

/**
 * @openapi
 * /bdf/prodotti:
 *   get:
 *     tags: [BDF]
 *     summary: Cerca prodotti per filtri
 *     parameters:
 *       - in: query
 *         name: ricalfa
 *         schema:
 *           type: string
 *         description: Ricerca alfabetica per nome (min 3 caratteri)
 *         example: "epik"
 *       - in: query
 *         name: coltura
 *         schema:
 *           type: integer
 *         description: Codice coltura
 *       - in: query
 *         name: avversita
 *         schema:
 *           type: string
 *         description: Codice avversità (richiede coltura)
 *       - in: query
 *         name: dettbio
 *         schema:
 *           type: boolean
 *         description: Solo prodotti biologici
 *       - in: query
 *         name: tipologia
 *         schema:
 *           type: string
 *         description: Codice tipologia
 *       - in: query
 *         name: codSA
 *         schema:
 *           type: string
 *         description: Codice sostanza attiva
 *     responses:
 *       200:
 *         description: Lista prodotti
 */

/**
 * @openapi
 * /bdf/prodotti/{id}:
 *   get:
 *     tags: [BDF]
 *     summary: Dettaglio singolo prodotto per codice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "3872"
 *     responses:
 *       200:
 *         description: Dettaglio prodotto
 */

/**
 * @openapi
 * /bdf/sostanze-attive:
 *   get:
 *     tags: [BDF]
 *     summary: Cerca sostanze attive per filtri
 *     parameters:
 *       - in: query
 *         name: ricalfa
 *         schema:
 *           type: string
 *         description: Ricerca alfabetica per nome (min 3 caratteri)
 *         example: "aba"
 *       - in: query
 *         name: coltura
 *         schema:
 *           type: integer
 *         description: Codice coltura
 *       - in: query
 *         name: dettbio
 *         schema:
 *           type: boolean
 *         description: Solo biologiche
 *       - in: query
 *         name: tipologia
 *         schema:
 *           type: string
 *         description: Codice tipologia
 *       - in: query
 *         name: codSA
 *         schema:
 *           type: string
 *         description: Codice sostanza attiva
 *     responses:
 *       200:
 *         description: Lista sostanze attive
 */

/**
 * @openapi
 * /bdf/sostanze-attive/{id}:
 *   get:
 *     tags: [BDF]
 *     summary: Dettaglio singola sostanza attiva per codice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice della sostanza attiva
 *         example: "0001"
 *     responses:
 *       200:
 *         description: Dettaglio sostanza attiva
 */

/**
 * @openapi
 * /bdf/composizione:
 *   get:
 *     tags: [BDF]
 *     summary: Composizione per codice formulato commerciale
 *     parameters:
 *       - in: query
 *         name: codice
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "0228"
 *     responses:
 *       200:
 *         description: Composizione del prodotto
 *       400:
 *         description: Parametro codice mancante
 */

/**
 * @openapi
 * /bdf/impieghi:
 *   get:
 *     tags: [BDF]
 *     summary: Colture autorizzate per codice formulato commerciale
 *     parameters:
 *       - in: query
 *         name: codice
 *         required: true
 *         schema:
 *           type: string
 *         description: Codice del formulato commerciale
 *         example: "2238"
 *     responses:
 *       200:
 *         description: Lista colture autorizzate
 *       400:
 *         description: Parametro codice mancante
 */

/**
 * @openapi
 * /bdf/distributori:
 *   get:
 *     tags: [BDF]
 *     summary: Distributori per codice formulato commerciale
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
 *         description: Lista distributori
 *       400:
 *         description: Parametro codice mancante
 */
