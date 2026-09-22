export {};

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: Elenca le aziende dell'utente autenticato
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: workspaceId
 *         schema:
 *           type: string
 *         description: When provided, returns companies scoped to the workspace assignments
 *     responses:
 *       200:
 *         description: Lista aziende
 *       401:
 *         description: Non autorizzato
 */

/**
 * @swagger
 * /companies:
 *   post:
 *     summary: Crea una nuova azienda
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
 *               - name
 *               - vatNumber
 *               - fiscalCode
 *               - nation
 *               - city
 *               - address
 *               - cap
 *               - email
 *               - phoneNumber
 *               - website
 *               - logoUrl
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
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               website:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               kind:
 *                 type: string
 *                 enum: [AGRICULTURAL, MANUFACTURING]
 *                 default: AGRICULTURAL
 *               workspaceId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional workspace context; company kind must match workspace kind when provided
 *     responses:
 *       201:
 *         description: Azienda creata con successo
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 *       409:
 *         description: Azienda già esistente
 */

/**
 * @swagger
 * /companies/bulk:
 *   post:
 *     summary: Crea più aziende in un'unica chiamata
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
 *               - companies
 *             properties:
 *               companies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - vatNumber
 *                     - fiscalCode
 *                     - nation
 *                     - city
 *                     - address
 *                     - cap
 *                     - email
 *                     - phoneNumber
 *                     - website
 *                     - logoUrl
 *                   properties:
 *                     name: { type: string }
 *                     vatNumber: { type: string }
 *                     fiscalCode: { type: string }
 *                     nation: { type: string }
 *                     city: { type: string }
 *                     address: { type: string }
 *                     cap: { type: string }
 *                     email: { type: string, format: email }
 *                     phoneNumber: { type: string }
 *                     website: { type: string }
 *                     logoUrl: { type: string }
 *                     ownerId: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Numero di aziende create
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 */

/**
 * @swagger
 * /companies/{id}:
 *   get:
 *     summary: Ottiene un'azienda per ID
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
 *       200:
 *         description: Azienda trovata
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */

/**
 * @swagger
 * /companies/bulk:
 *   put:
 *     summary: Aggiorna più aziende in bulk
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
 *               - companies
 *             properties:
 *               companies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     vatNumber:
 *                       type: string
 *                     fiscalCode:
 *                       type: string
 *                     nation:
 *                       type: string
 *                     city:
 *                       type: string
 *                     address:
 *                       type: string
 *                     cap:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     phoneNumber:
 *                       type: string
 *                     website:
 *                       type: string
 *                     logoUrl:
 *                       type: string
 *     responses:
 *       200:
 *         description: Aziende aggiornate con successo
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 */
