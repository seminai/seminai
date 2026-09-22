export {};

/**
 * @swagger
 * /products/verified-phytosanitary:
 *   get:
 *     summary: List verified phytosanitary products (PESTICIDE category) that exist in fitosanitari database and are not revoked
 *     description: Returns products with category PESTICIDE that have a matching name in the official fitosanitari database and are not in revoked status. Can be filtered by companyId or returns all products from user's companies.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional company ID to filter products by specific company. If not provided, returns products from all user's companies.
 *     responses:
 *       200:
 *         description: List of verified phytosanitary products
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
 *                       description: List of verified phytosanitary products
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           category:
 *                             type: string
 *                             example: PESTICIDE
 *                           registrationNumber:
 *                             type: string
 *                             nullable: true
 *                           administrativeStatus:
 *                             type: string
 *                             nullable: true
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
 *                     totalProducts:
 *                       type: number
 *                       description: Total number of PESTICIDE products found
 *                     verifiedProducts:
 *                       type: number
 *                       description: Number of products verified and not revoked
 *                     revokedProducts:
 *                       type: number
 *                       description: Number of products found but revoked
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Fitosanitari file not found or internal error
 */

/**
 * @swagger
 * /products/update-administrative-status:
 *   post:
 *     summary: Update administrative status for all products from fitosanitari database
 *     description: Reads the fitosanitari JSON file and updates the administrativeStatus field for all products that have a matching registrationNumber (num_registrazione).
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Administrative status updated successfully
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
 *                     productsUpdated:
 *                       type: number
 *                       description: Number of products updated
 *                     totalProductsWithRegistration:
 *                       type: number
 *                       description: Total number of products with registration number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Fitosanitari file not found or internal error
 */

/**
 * @swagger
 * /products/ministry-search:
 *   get:
 *     summary: Search Ministry phytosanitary products by name, active ingredient, or registration number
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: General search across product name, active ingredient, and registration number
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Product name filter
 *       - in: query
 *         name: registrationNumber
 *         schema:
 *           type: string
 *         description: Registration number filter
 *       - in: query
 *         name: activeIngredient
 *         schema:
 *           type: string
 *         description: Active ingredient filter
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *         description: Maximum number of products to return
 *     responses:
 *       200:
 *         description: Ministry product matches
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get Product by ID with warehouse name and company info
 *     description: Returns product with only verified stocks (stocks without job or with job.isVerified=true)
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
 *       200:
 *         description: Product found with verified stocks only, warehouse name, company ID and company name
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
 *                     product:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         sku:
 *                           type: string
 *                         principioAttivo:
 *                           type: string
 *                           nullable: true
 *                           description: Principio attivo estratto dall'etichetta del prodotto
 *                         warehouseId:
 *                           type: string
 *                         warehouse:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                             company:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                         stocks:
 *                           type: array
 *                           items:
 *                             type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
