import { Router, Request, Response } from 'express';
import { AgentChatController } from '../controllers/AgentChatController';
import { AgentExtractionReviewController } from '../controllers/AgentExtractionReviewController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { upload } from '../../services/Multer';
import { OuterLoopService } from '../../services/agents/dosage_agent_react/outer-loop/outer-loop.service';
import { AppError } from '../../../domain/errors/AppError';

const agentChatRouter = Router();
const controller = new AgentChatController();
const extractionReviewController = new AgentExtractionReviewController();

agentChatRouter.post(
  '/stream',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler(controller.stream.bind(controller)),
);

agentChatRouter.post(
  '/message',
  ensureAuthenticated,
  asyncHandler(controller.message.bind(controller)),
);

agentChatRouter.post(
  '/approve',
  ensureAuthenticated,
  asyncHandler(controller.approve.bind(controller)),
);

agentChatRouter.post(
  '/reject',
  ensureAuthenticated,
  asyncHandler(controller.reject.bind(controller)),
);

agentChatRouter.post(
  '/cancel',
  ensureAuthenticated,
  asyncHandler(controller.cancel.bind(controller)),
);

agentChatRouter.get(
  '/threads/:threadId/stream-state',
  ensureAuthenticated,
  asyncHandler(controller.getStreamState.bind(controller)),
);

agentChatRouter.get(
  '/threads/:threadId/stream-events',
  ensureAuthenticated,
  asyncHandler(controller.getStreamEvents.bind(controller)),
);

agentChatRouter.get(
  '/state/:threadId',
  ensureAuthenticated,
  asyncHandler(controller.getState.bind(controller)),
);

// ── Extraction Review (Fase 3 + 4) ──

agentChatRouter.get(
  '/pending-extraction/:reviewId',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.getById.bind(extractionReviewController)),
);

agentChatRouter.patch(
  '/pending-extraction/:reviewId',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.save.bind(extractionReviewController)),
);

agentChatRouter.post(
  '/pending-extraction/:reviewId/commit',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.commit.bind(extractionReviewController)),
);

agentChatRouter.post(
  '/pending-extraction/:reviewId/cancel',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.cancel.bind(extractionReviewController)),
);

// ── Outer Loop Triggers ──

const outerLoopService = new OuterLoopService();

agentChatRouter.post(
  '/outer-loop/schedule',
  ensureAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    const { type, title, payload, scheduledAt, threadId } = req.body;
    const trigger = await outerLoopService.scheduleAlert({
      userId,
      type,
      title,
      payload: payload ?? {},
      scheduledAt: new Date(scheduledAt),
      threadId,
    });
    return res.status(201).json(trigger);
  }),
);

agentChatRouter.get(
  '/outer-loop/triggers',
  ensureAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    const status = req.query.status as string | undefined;
    const triggers = await outerLoopService.listAllTriggers(userId, { status });
    return res.json(triggers);
  }),
);

agentChatRouter.delete(
  '/outer-loop/triggers/:id',
  ensureAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    await outerLoopService.cancelAlert(req.params.id, userId);
    return res.status(204).send();
  }),
);

export { agentChatRouter };
