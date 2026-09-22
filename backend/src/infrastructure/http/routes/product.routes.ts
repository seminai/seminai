import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaProductRepository } from '../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';
import { ProductController } from '../controllers/ProductController';
import { ProductMinistrySearchController } from '../controllers/ProductMinistrySearchController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';

const router = Router();
const productRepository = new PrismaProductRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const controller = new ProductController(
  productRepository,
  stockRepository,
  warehouseRepository,
  prisma,
);
const ministrySearchController = new ProductMinistrySearchController();

router.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByUser(req, res)),
);

router.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.create(req, res)),
);

router.post(
  '/bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.createBulk(req, res)),
);

router.post(
  '/create-or-update-bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.createOrUpdateBulk(req, res)),
);

router.post(
  '/align-products',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.alignProducts(req, res)),
);

router.post(
  '/sync-labels',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.syncLabels(req, res)),
);

router.delete(
  '/bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.deleteBulk(req, res)),
);

router.post(
  '/bulk-from-ddt-to-product-list',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler((req, res) => controller.bulkFromDdtToProductList(req, res)),
);

router.post(
  '/bulk-from-invoice-to-product-list',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler((req, res) => controller.bulkFromInvoiceToProductList(req, res)),
);

router.post(
  '/import-from-csv-excel',
  ensureAuthenticated,
  upload.single('file'),
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.importFromCsvExcel(req, res)),
);

router.get(
  '/template',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.downloadTemplate(req, res)),
);

router.get(
  '/verified-phytosanitary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listVerifiedPhytosanitaryProducts(req, res)),
);

router.post(
  '/update-administrative-status',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.updateAdministrativeStatus(req, res)),
);

router.get(
  '/ministry-search',
  ensureAuthenticated,
  asyncHandler((req, res) => ministrySearchController.search(req, res)),
);

router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

router.get(
  '/warehouse/:warehouseId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByWarehouse(req, res)),
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

export { router as productRouter };
