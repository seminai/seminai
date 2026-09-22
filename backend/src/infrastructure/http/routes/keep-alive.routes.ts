import { Router } from 'express';
import { KeepAliveController } from '../controllers/KeepAliveController';

const router = Router();
const controller = new KeepAliveController();

/**
 * @route GET /keep-alive/status
 * @desc Ottiene lo stato e le metriche del keep-alive service
 * @access Public (può essere ristretto con middleware di autenticazione se necessario)
 */
router.get('/status', (req, res) => controller.getStatus(req, res));

export default router;
