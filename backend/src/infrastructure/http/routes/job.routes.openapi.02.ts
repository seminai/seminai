export {};

/**
 * @swagger
 * /jobs/group/{jobId}:
 *   get:
 *     summary: Retrieve all jobs with the same jobId
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
 *         description: Filter jobs by jobId
 *     responses:
 *       200:
 *         description: List of jobs with the specified jobId
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get Job by ID
 *     tags: [Jobs]
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
 *         description: Job found
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /jobs/production-unit/{productionUnitId}:
 *   get:
 *     summary: List Jobs by Production Unit
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productionUnitId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of jobs
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /jobs/bulk:
 *   put:
 *     summary: Bulk update multiple Jobs (all must belong to the same company)
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
 *             required: [updates]
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, data]
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Job ID to update
 *                     data:
 *                       type: object
 *                       description: Partial job fields to update
 *     responses:
 *       200:
 *         description: Jobs updated successfully
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
 *                     updatedCount:
 *                       type: integer
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Missing or invalid data, or jobs from different companies
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more jobs not found
 */

/**
 * @swagger
 * /jobs/{id}:
 *   put:
 *     summary: Update a Job and replace its attached stock movements (if provided)
 *     tags: [Jobs]
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
 *     responses:
 *       200:
 *         description: Job updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /jobs/bulk:
 *   delete:
 *     summary: Bulk delete multiple Jobs and their attached stock movements
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
 *             required: [jobIds]
 *             properties:
 *               jobIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of Job IDs to delete
 *               force:
 *                 type: boolean
 *                 default: false
 *                 description: If true, force cancel active (running) jobs. If false, active jobs will not be cancelled.
 *     responses:
 *       200:
 *         description: Jobs deleted successfully
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
 *                     deletedCount:
 *                       type: number
 *                       example: 3
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more jobs not found
 */

/**
 * @swagger
 * /jobs/{id}:
 *   delete:
 *     summary: Delete a Job and its attached stock movements
 *     tags: [Jobs]
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

/**
 * @swagger
 * /jobs/{id}/assign-user:
 *   patch:
 *     summary: Assign an operator user to a Job
 *     tags: [Jobs]
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
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: User assigned to job
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not in company
 *       404:
 *         description: Job or User not found
 */
