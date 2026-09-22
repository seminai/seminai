export {};

/**
 * @swagger
 * /workspaces/{id}/companies:
 *   put:
 *     summary: Sostituisce le aziende assegnate al workspace
 *     tags: [Workspaces]
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
 *               - companyIds
 *             properties:
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Assegnazioni aggiornate
 */

/**
 * @swagger
 * /workspaces/{id}/invite:
 *   post:
 *     summary: Invita un membro al workspace
 *     tags: [Workspaces]
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
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ADMIN, MEMBER, VIEWER]
 *     responses:
 *       201:
 *         description: Invito creato
 */

/**
 * @swagger
 * /workspaces/{id}/members/{memberId}:
 *   put:
 *     summary: Aggiorna ruolo/permessi di un membro
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
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Membro aggiornato
 */

/**
 * @swagger
 * /workspaces/{id}/members/{memberId}:
 *   delete:
 *     summary: Rimuove un membro dal workspace
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
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Membro rimosso
 */

/**
 * @swagger
 * /workspaces/{id}/logo:
 *   post:
 *     summary: Carica un logo e estrae automaticamente i colori per il template
 *     tags: [Workspaces]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - logo
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: File immagine del logo (PNG, JPG, etc.)
 *     responses:
 *       200:
 *         description: Logo caricato e colori estratti
 */
