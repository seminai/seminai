export {};

/**
 * @swagger
 * /products/warehouse/{warehouseId}:
 *   get:
 *     summary: List products by warehouse with verified stocks, warehouse name and company info
 *     description: Returns products with only verified stocks (stocks without job or with job.isVerified=true)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: warehouseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of products with verified stocks only, warehouse name, company ID and company name
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
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           principioAttivo:
 *                             type: string
 *                             nullable: true
 *                             description: Principio attivo estratto dall'etichetta del prodotto
 *                           warehouseId:
 *                             type: string
 *                           warehouse:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                               company:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                   name:
 *                                     type: string
 *                           stocks:
 *                             type: array
 *                             items:
 *                               type: object
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update a Product
 *     description: All fields are optional; only provided fields are updated.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
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
 *             properties:
 *               name:
 *                 type: string
 *               sku:
 *                 type: string
 *               barcode:
 *                 type: string
 *                 nullable: true
 *               category:
 *                 $ref: '#/components/schemas/ProductCategory'
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               administrativeStatus:
 *                 type: string
 *                 nullable: true
 *               registrationNumber:
 *                 type: string
 *                 nullable: true
 *               labelUrl:
 *                 type: string
 *                 nullable: true
 *               labelMetadata:
 *                 type: object
 *                 nullable: true
 *               warehouseId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Product updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a Product
 *     tags: [Products]
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
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
