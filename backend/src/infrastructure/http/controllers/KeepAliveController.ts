import { Request, Response } from 'express';
import { getKeepAliveMetrics } from '../../services/queue-keepalive.service';

/**
 * Controller per il monitoraggio del Keep-Alive Service
 */
export class KeepAliveController {
  /**
   * Ottiene lo stato e le metriche del keep-alive service
   *
   * @swagger
   * /keep-alive/status:
   *   get:
   *     summary: Ottiene lo stato del keep-alive service
   *     description: Ritorna metriche dettagliate sul funzionamento del keep-alive service
   *     tags:
   *       - Monitoring
   *     responses:
   *       200:
   *         description: Stato del keep-alive service
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
   *                     isEnabled:
   *                       type: boolean
   *                     totalRequests:
   *                       type: number
   *                     successfulRequests:
   *                       type: number
   *                     failedRequests:
   *                       type: number
   *                     successRate:
   *                       type: number
   *                     consecutiveFailures:
   *                       type: number
   *                     lastSuccessTime:
   *                       type: string
   *                       nullable: true
   *                     lastFailureTime:
   *                       type: string
   *                       nullable: true
   *                     uptime:
   *                       type: number
   */
  async getStatus(_req: Request, res: Response): Promise<Response> {
    const metrics = getKeepAliveMetrics();

    const successRate =
      metrics.totalRequests > 0
        ? Math.round((metrics.successfulRequests / metrics.totalRequests) * 100)
        : 100;

    return res.json({
      status: 'success',
      data: {
        isEnabled: metrics.isEnabled,
        totalRequests: metrics.totalRequests,
        successfulRequests: metrics.successfulRequests,
        failedRequests: metrics.failedRequests,
        successRate,
        consecutiveFailures: metrics.consecutiveFailures,
        lastSuccessTime: metrics.lastSuccessTime
          ? new Date(metrics.lastSuccessTime).toISOString()
          : null,
        lastFailureTime: metrics.lastFailureTime
          ? new Date(metrics.lastFailureTime).toISOString()
          : null,
        uptime: process.uptime(),
        healthStatus: this.determineHealthStatus(metrics),
      },
    });
  }

  /**
   * Determina lo stato di salute del servizio basato sulle metriche
   */
  private determineHealthStatus(metrics: ReturnType<typeof getKeepAliveMetrics>): string {
    if (!metrics.isEnabled) {
      return 'disabled';
    }

    if (metrics.totalRequests === 0) {
      return 'idle';
    }

    if (metrics.consecutiveFailures >= 5) {
      return 'critical';
    }

    if (metrics.consecutiveFailures >= 3) {
      return 'warning';
    }

    const successRate =
      metrics.totalRequests > 0 ? (metrics.successfulRequests / metrics.totalRequests) * 100 : 100;

    if (successRate >= 95) {
      return 'healthy';
    }

    if (successRate >= 80) {
      return 'degraded';
    }

    return 'unhealthy';
  }
}
