export {};

/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: Job CRUD operations
 */

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new Job with optional attached stock movements
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Job created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/create-product-and-job:
 *   post:
 *     summary: Bulk create Jobs and upsert related Products with Stocks
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       201:
 *         description: Jobs created with explicit job-product links
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
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     jobProductLinks:
 *                       type: array
 *                       description: Explicit mapping between each created job and linked products
 *                       items:
 *                         type: object
 *                         properties:
 *                           jobId:
 *                             type: string
 *                           stockCount:
 *                             type: integer
 *                           products:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                                 registrationNumber:
 *                                   type: string
 *                                   nullable: true
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/create-product-and-job/status/{jobId}:
 *   get:
 *     summary: Get the status of an async product-job creation task
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status
 *       404:
 *         description: Job not found
 */

/**
 * @swagger
 * /jobs/me:
 *   get:
 *     summary: List Jobs assigned to the authenticated user within their companies
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter jobs by company name (case-insensitive partial match)
 *     responses:
 *       200:
 *         description: List of jobs with related production units, fields, and company
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/me/verified:
 *   get:
 *     summary: List verified and conformity checked Jobs (isVerified=true AND conformityChecked=true) assigned to the authenticated user within their companies
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter jobs by company name (case-insensitive partial match)
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page (max 100)
 *     responses:
 *       200:
 *         description: List of verified and conformity checked jobs with related production units, fields, and company
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
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 45
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/get-job-grouped-by-job-id:
 *   get:
 *     summary: Retrieve all jobs grouped by their jobId
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Jobs grouped by jobId
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/groups-summary:
 *   get:
 *     summary: Get a summary of job groups with operation counts
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of job groups with summary data
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
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           jobId:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           company:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           totalOperations:
 *                             type: number
 *                           verifiedOperations:
 *                             type: number
 *                           pendingOperations:
 *                             type: number
 *       401:
 *         description: Unauthorized
 */
