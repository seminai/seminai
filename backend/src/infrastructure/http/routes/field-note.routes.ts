import { Router } from 'express';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { FieldNoteController } from '../controllers/FieldNoteController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { GetFieldNoteByIdUseCase } from '../../../application/use-cases/field-note/GetFieldNoteByIdUseCase';
import { ListFieldNotesByUserUseCase } from '../../../application/use-cases/field-note/ListFieldNotesByUserUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { DeleteFieldNoteUseCase } from '../../../application/use-cases/field-note/DeleteFieldNoteUseCase';
import { AddFieldNoteAttachmentUseCase } from '../../../application/use-cases/field-note/AddFieldNoteAttachmentUseCase';
import { GetFieldNoteStatsUseCase } from '../../../application/use-cases/field-note/GetFieldNoteStatsUseCase';
import { upload } from '../../services/Multer';

const router = Router();
const fieldNoteRepository = new PrismaFieldNoteRepository(prisma);

const createFieldNoteUseCase = new CreateFieldNoteUseCase(fieldNoteRepository);
const getFieldNoteByIdUseCase = new GetFieldNoteByIdUseCase(fieldNoteRepository);
const listFieldNotesByUserUseCase = new ListFieldNotesByUserUseCase(fieldNoteRepository);
const updateFieldNoteUseCase = new UpdateFieldNoteUseCase(fieldNoteRepository);
const deleteFieldNoteUseCase = new DeleteFieldNoteUseCase(fieldNoteRepository);
const addFieldNoteAttachmentUseCase = new AddFieldNoteAttachmentUseCase(fieldNoteRepository);
const getFieldNoteStatsUseCase = new GetFieldNoteStatsUseCase(fieldNoteRepository);

const controller = new FieldNoteController(
  createFieldNoteUseCase,
  getFieldNoteByIdUseCase,
  listFieldNotesByUserUseCase,
  updateFieldNoteUseCase,
  deleteFieldNoteUseCase,
  addFieldNoteAttachmentUseCase,
  getFieldNoteStatsUseCase,
);

router.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

router.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

router.get(
  '/stats',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getStats(req, res)),
);

router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getById(req, res)),
);

router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

router.post(
  '/attachments',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => controller.addAttachment(req, res)),
);

export { router as fieldNoteRouter };
