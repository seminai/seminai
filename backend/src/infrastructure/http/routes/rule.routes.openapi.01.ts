export {};

/**
 * @swagger
 * tags:
 *   name: Rules
 *   description: Gestione disciplinari e regole
 */

/**
 * @swagger
 * /workspaces/{workspaceId}/rules:
 *   get:
 *     summary: Elenca le regole di un workspace
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ARCHIVED, DEPRECATED]
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista regole
 */

/**
 * @swagger
 * /workspaces/{workspaceId}/rules:
 *   post:
 *     summary: Crea una nuova regola (con upload PDF opzionale)
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM]
 *               content:
 *                 type: string
 *                 description: JSON string of the rule content
 *               sourceUrl:
 *                 type: string
 *               sourceDocument:
 *                 type: string
 *               region:
 *                 type: string
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *               version:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               isTemplate:
 *                 type: boolean
 *               pdfFile:
 *                 type: string
 *                 format: binary
 *                 description: Optional PDF file for vectorization
 *     responses:
 *       201:
 *         description: Regola creata
 */

/**
 * @swagger
 * /rules/marketplace:
 *   get:
 *     summary: Elenca le regole pubbliche disponibili nel marketplace
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM]
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista marketplace
 */

/**
 * @swagger
 * /workspaces/{workspaceId}/rules/from-public/{ruleId}:
 *   post:
 *     summary: Duplica una regola pubblica nel workspace
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Regola privata creata
 */

/**
 * @swagger
 * /rules/{id}:
 *   get:
 *     summary: Ottiene una regola per ID
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
 *         description: Regola trovata
 */

/**
 * @swagger
 * /rules/{id}:
 *   put:
 *     summary: Aggiorna una regola (con upload PDF opzionale)
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
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdfFile:
 *                 type: string
 *                 format: binary
 *                 description: Optional PDF file for vectorization
 *     responses:
 *       200:
 *         description: Regola aggiornata
 */

/**
 * @swagger
 * /rules/{id}:
 *   delete:
 *     summary: Elimina una regola
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
 *       204:
 *         description: Regola eliminata
 */
