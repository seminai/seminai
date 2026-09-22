import { Router } from 'express';
import { AudioToTextController } from '../controllers/AudioToTextController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { audioUpload } from '../../services/Multer';

const audioToTextRouter = Router();
const controller = new AudioToTextController();

/**
 * @swagger
 * tags:
 *   name: Audio to Text
 *   description: Audio transcription service using OpenAI Whisper
 */

/**
 * @swagger
 * /audio-to-text/transcribe:
 *   post:
 *     summary: Transcribe an audio file to text
 *     tags: [Audio to Text]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (mp3, mp4, mpeg, mpga, m4a, wav, webm)
 *               prompt:
 *                 type: string
 *                 description: Optional prompt to guide transcription
 *               responseFormat:
 *                 type: string
 *                 enum: [json, text, srt, verbose_json, vtt]
 *                 description: Response format (default verbose_json)
 *               postProcess:
 *                 type: string
 *                 enum: ['true', 'false', '1', '0']
 *                 description: Enable LLM post-processing to improve transcription quality
 *     responses:
 *       200:
 *         description: Transcription result
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
 *                     text:
 *                       type: string
 *                       description: Transcribed text
 *                     language:
 *                       type: string
 *                       description: Detected language
 *                     duration:
 *                       type: number
 *                       description: Audio duration in seconds
 *                     segments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: number
 *                           end:
 *                             type: number
 *                           text:
 *                             type: string
 *       400:
 *         description: Missing audio file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Transcription error
 */
audioToTextRouter.post(
  '/transcribe',
  ensureAuthenticated,
  audioUpload.single('file'),
  asyncHandler(controller.transcribe.bind(controller)),
);

export { audioToTextRouter };
