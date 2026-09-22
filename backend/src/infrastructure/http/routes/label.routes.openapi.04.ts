export {};

/**
 * @openapi
 * /labels/verify-label/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Aggiorna lo stato di verifica di un'etichetta
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ isVerified ]
 *             properties:
 *               isVerified:
 *                 type: boolean
 *                 description: Stato di verifica dell'etichetta
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o isVerified non valido
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 */

/**
 * @openapi
 * /labels/update-label/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Aggiorna un'etichetta ri-estraendo i dati dal rawText esistente
 *     description: Legge il rawText dell'etichetta esistente e sovrascrive i dati estratti con una nuova estrazione. Richiede ruolo ADMIN o LABEL_MANAGER.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dell'etichetta da aggiornare
 *     responses:
 *       200:
 *         description: Etichetta aggiornata con successo
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o rawText vuoto
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 */

/**
 * @openapi
 * /labels/extract-with-mistral/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Ri-estrae i dati di un'etichetta usando SOLO Mistral LLM
 *     description: Legge il rawText dell'etichetta esistente e sovrascrive i dati estratti usando esclusivamente Mistral come modello di estrazione. Richiede ruolo ADMIN o LABEL_MANAGER.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dell'etichetta da ri-estrarre con Mistral
 *     responses:
 *       200:
 *         description: Etichetta ri-estratta con successo usando Mistral
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id o rawText vuoto
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 *       500:
 *         description: MISTRAL_API_KEY non configurata
 */
