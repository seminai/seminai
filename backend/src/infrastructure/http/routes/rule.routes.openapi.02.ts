export {};

/**
 * @swagger
 * /rules/{id}/companies:
 *   post:
 *     summary: Assegna una regola a una company
 *     tags: [Rules]
 *     security:
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
 *             required:
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *               workspaceId:
 *                 type: string
 *                 description: Workspace attivo usato per autorizzare regole pubbliche
 *               priority:
 *                 type: integer
 *               overrides:
 *                 type: object
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Regola assegnata
 */

/**
 * @swagger
 * /rules/{id}/companies:
 *   get:
 *     summary: Elenca le aziende assegnate a una regola
 *     tags: [Rules]
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
 *         description: Lista aziende assegnate alla regola
 */

/**
 * @swagger
 * /rules/{id}/companies/{companyId}:
 *   delete:
 *     summary: Rimuove l'assegnazione di una regola da una company
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Assegnazione rimossa
 */

/**
 * @swagger
 * /companies/{companyId}/rules:
 *   get:
 *     summary: Elenca le regole assegnate a una company
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: onlyActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista regole della company
 */

/**
 * @swagger
 * /rules/{id}/vectorize:
 *   post:
 *     summary: Riaccoda la vettorializzazione del PDF di una regola
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       202:
 *         description: Job di vettorializzazione accodato
 */

/**
 * @swagger
 * /rules/{id}/chunks:
 *   get:
 *     summary: Anteprima dei chunk vettorializzati per una regola
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Lista chunk
 */
