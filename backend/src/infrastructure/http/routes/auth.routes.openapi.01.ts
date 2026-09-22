export {};

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registra un nuovo utente
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - inviteCode
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               inviteCode:
 *                 type: string
 *                 description: Invite code required for registration
 *               surname:
 *                 type: string
 *               fiscalCode:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               profilePictureUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Utente registrato con successo
 *       400:
 *         description: Errore nella registrazione
 *       409:
 *         description: Utente già esistente
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Effettua il login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login effettuato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [ADMIN, GOD, BASIC, LABEL_MANAGER]
 *                     credits:
 *                       type: number
 *       400:
 *         description: Credenziali non valide
 */

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Richiedi il reset della password
 *     tags: [Auth]
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
 *                 format: email
 *     responses:
 *       200:
 *         description: Se l'email esiste, un link di reset è stato inviato
 *       400:
 *         description: Email mancante
 */

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reimposta la password con il token di reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reimpostata con successo
 *       400:
 *         description: Token non valido o password non corrispondenti
 */

/**
 * @swagger
 * /auth/verify:
 *   get:
 *     summary: Verifica l'email dell'utente
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email verificata con successo
 *       400:
 *         description: Token non valido
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Ottiene i dati dell'utente corrente
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dati dell'utente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 emailVerified:
 *                   type: boolean
 *                 role:
 *                   type: string
 *                   enum: [ADMIN, GOD, BASIC, LABEL_MANAGER]
 *                 credits:
 *                   type: number
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Utente non trovato
 */

/**
 * @swagger
 * /auth/update-password:
 *   put:
 *     summary: Aggiorna la password dell'utente corrente
 *     tags: [Auth]
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
 *               - oldPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password aggiornata con successo
 *       400:
 *         description: Dati mancanti o password non corrispondenti
 *       401:
 *         description: Non autorizzato o password vecchia non corretta
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Effettua il logout (cancella il cookie di sessione)
 *     description: Non richiede token valido; può essere chiamato anche con token scaduto per evitare loop 401.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout effettuato con successo (cookie auth_token cancellato)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Logout successful
 */
