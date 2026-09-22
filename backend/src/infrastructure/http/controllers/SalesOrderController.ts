import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { SalesOrderStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ISalesOrderRepository } from '../../../domain/repositories/ISalesOrderRepository';
import { CreateSalesOrderUseCase } from '../../../application/use-cases/sales-order/CreateSalesOrderUseCase';
import { ConfirmSalesOrderUseCase } from '../../../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { GenerateDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { GenerateProformaUseCase } from '../../../application/use-cases/proforma/GenerateProformaUseCase';
import { ImportSalesOrderFromTemplateUseCase } from '../../../application/use-cases/sales-order/ImportSalesOrderFromTemplateUseCase';

function parseStatus(value: unknown): SalesOrderStatus | undefined {
  const statuses = Object.values(SalesOrderStatus) as string[];
  return typeof value === 'string' && statuses.includes(value)
    ? (value as SalesOrderStatus)
    : undefined;
}

/** REST controller for sales orders (create, confirm, generate DDT, list). */
export class SalesOrderController {
  constructor(
    private readonly createUseCase: CreateSalesOrderUseCase,
    private readonly confirmUseCase: ConfirmSalesOrderUseCase,
    private readonly generateDdtUseCase: GenerateDeliveryNoteUseCase,
    private readonly generateProformaUseCase: GenerateProformaUseCase,
    private readonly importTemplateUseCase: ImportSalesOrderFromTemplateUseCase,
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  /** Streams the fixed-column order template (.xlsx) for agents to fill. */
  async downloadTemplate(_request: Request, response: Response): Promise<Response> {
    const workbook = XLSX.utils.book_new();
    const order = XLSX.utils.aoa_to_sheet([
      ['Nome cliente', 'Azienda Rossi S.r.l.'],
      ['P.IVA', 'IT01234567890'],
      ['Note di consegna', 'Consegna entro venerdì'],
      [],
      ['Prodotto', 'Annata', 'Quantità', 'Prezzo unitario'],
      ['Amarone della Valpolicella', 2018, 12, 15.5],
    ]);
    XLSX.utils.book_append_sheet(workbook, order, 'Ordine');
    const instructions = XLSX.utils.aoa_to_sheet([
      ['Istruzioni'],
      ['- Compila "Nome cliente" (obbligatorio) e "P.IVA" per l’abbinamento anagrafica.'],
      [
        '- Nella tabella: "Prodotto" e "Quantità" obbligatori; "Annata" e "Prezzo unitario" opzionali.',
      ],
      ['- Se il prezzo unitario è vuoto, viene usato il listino del prodotto.'],
      ['- Non rinominare le intestazioni di colonna.'],
    ]);
    XLSX.utils.book_append_sheet(workbook, instructions, 'Istruzioni');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', 'attachment; filename="order-template.xlsx"');
    response.setHeader('Content-Length', buffer.length);
    return response.send(buffer);
  }

  /** Parses an uploaded template and creates a DRAFT order when fully resolved. */
  async importFromTemplate(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.body?.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const file = request.file;
    if (!file?.buffer) throw AppError.badRequest('file is required', 'MISSING_FILE');
    const preview = await this.importTemplateUseCase.preview({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      companyId,
      sourceChannel: 'template',
    });
    const partnerId =
      (request.body?.partnerId as string | undefined) ?? preview.partner.matchedId ?? undefined;
    const linesCreatable =
      preview.lines.length > 0 &&
      preview.lines.every(
        (line) => line.matchedProductId && !line.warnings.includes('PRODUCT_INACTIVE'),
      );
    if (!linesCreatable) {
      return response.json({ status: 'success', data: { preview, needsResolution: true } });
    }
    const result = await this.importTemplateUseCase.commit({
      companyId,
      partnerId,
      customerName: preview.standardOrder.customerName,
      customerVat: preview.standardOrder.customerVat,
      lines: preview.lines,
      deliveryNotesText: preview.standardOrder.deliveryNotesText,
      sourceChannel: 'template',
      sourceRef: 'template',
    });
    return response.status(201).json({
      status: 'success',
      data: {
        order: result.order.order,
        items: result.order.items,
        totals: result.totals,
        preview,
      },
    });
  }

  async create(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.body?.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const result = await this.createUseCase.execute(request.body);
    return response.status(201).json({
      status: 'success',
      data: { order: result.order.order, items: result.order.items, totals: result.totals },
    });
  }

  async confirm(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.assertOrderAccess(id, userId);
    const confirmed = await this.confirmUseCase.execute({ orderId: id });
    return response.json({
      status: 'success',
      data: { order: confirmed.order, items: confirmed.items },
    });
  }

  async generateDdt(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.assertOrderAccess(id, userId);
    const result = await this.generateDdtUseCase.execute({ ...request.body, orderId: id });
    return response.status(201).json({
      status: 'success',
      data: { deliveryNote: result.deliveryNote, items: result.items },
    });
  }

  async generateProforma(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.assertOrderAccess(id, userId);
    const result = await this.generateProformaUseCase.execute({ ...request.body, orderId: id });
    return response.status(201).json({
      status: 'success',
      data: { proformaInvoice: result.proformaInvoice, items: result.items },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.query.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const orders = await this.salesOrderRepository.findManyByCompany(companyId, {
      status: parseStatus(request.query.status),
    });
    return response.json({ status: 'success', data: { orders } });
  }

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  private async assertOrderAccess(orderId: string, userId: string): Promise<void> {
    const found = await this.salesOrderRepository.findById(orderId);
    if (!found) throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    await this.assertCompanyAccess(found.order.companyId, userId);
  }

  private async assertCompanyAccess(companyId: string, userId: string): Promise<void> {
    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(companyId, userId);
    if (!membership) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
  }
}
