export {};

/**
 * @swagger
 * tags:
 *   name: Workspaces
 *   description: Gestione workspace e membri
 */

/**
 * @swagger
 * /workspaces:
 *   get:
 *     summary: Elenca i workspace dell'utente autenticato
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista workspace
 */

/**
 * @swagger
 * /workspaces:
 *   post:
 *     summary: Crea un nuovo workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - kind
 *             properties:
 *               name:
 *                 type: string
 *               kind:
 *                 type: string
 *                 enum: [AGRICULTURAL, MANUFACTURING]
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               iconUrl:
 *                 type: string
 *               primaryColor:
 *                 type: string
 *               secondaryColor:
 *                 type: string
 *               accentColor:
 *                 type: string
 *               plan:
 *                 type: string
 *                 enum: [FREE, PROFESSIONAL, ENTERPRISE]
 *               enabledModules:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [DCA, LABELS]
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional companies to assign to the workspace at creation
 *     responses:
 *       201:
 *         description: Workspace creato
 */

/**
 * @swagger
 * /workspaces/invitations/pending:
 *   get:
 *     summary: Elenca gli inviti pendenti dell'utente autenticato
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista inviti pendenti con dettagli workspace
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
 *                     invitations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           workspaceId:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           token:
 *                             type: string
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                           workspace:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                               logoUrl:
 *                                 type: string
 */

/**
 * @swagger
 * /workspaces/invitations/{token}/accept:
 *   post:
 *     summary: Accetta un invito al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invito accettato
 */

/**
 * @swagger
 * /workspaces/{id}/invitations/{invitationId}:
 *   delete:
 *     summary: Elimina un invito al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Invito eliminato
 */

/**
 * @swagger
 * /workspaces/{id}:
 *   get:
 *     summary: Ottiene un workspace per ID
 *     tags: [Workspaces]
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
 *         description: Workspace trovato
 */

/**
 * @swagger
 * /workspaces/{id}:
 *   put:
 *     summary: Aggiorna un workspace
 *     tags: [Workspaces]
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
 *         description: Workspace aggiornato
 */

/**
 * @swagger
 * /workspaces/{id}:
 *   delete:
 *     summary: Elimina un workspace
 *     tags: [Workspaces]
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
 *         description: Workspace eliminato
 */

/**
 * @swagger
 * /workspaces/{id}/members:
 *   get:
 *     summary: Elenca i membri del workspace
 *     tags: [Workspaces]
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
 *         description: Lista membri
 */

/**
 * @swagger
 * /workspaces/{id}/companies:
 *   get:
 *     summary: Elenca le aziende assegnate al workspace
 *     tags: [Workspaces]
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
 *         description: Lista aziende assegnate
 */
