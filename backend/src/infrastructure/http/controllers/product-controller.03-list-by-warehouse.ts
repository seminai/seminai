import { Request, Response } from 'express';
import { triggerLabelSyncIfStale } from '../../services/product/triggerLabelSyncIfStale';
import type { ProductControllerContext } from './product-controller.context';
import { withPrincipioAttivo } from './product-controller.helpers';

export async function productControllerListByWarehouse(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    const { warehouseId } = request.params;
    const list = await this.productRepository.findManyByWarehouseId(warehouseId);
    if (request.user?.id) {
      triggerLabelSyncIfStale(request.user.id, list);
    }
    return response.json({ status: 'success', data: { products: list.map(withPrincipioAttivo) } });
  }
