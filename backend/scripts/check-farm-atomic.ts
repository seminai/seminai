import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/** Acceptance probe against the real API/database: activity and consumption commit together. */
export async function checkFarmAtomic(
  prisma: PrismaClient,
  url: string,
  token: string,
  companyId: string,
  productId: string,
) {
  const field = await prisma.field.create({ data: { name: 'Synthetic field', companyId } });
  const unit = await prisma.productionUnit.create({
    data: {
      name: 'Synthetic crop',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      areaHa: 1,
      productionUnitsOnFields: { create: { fieldId: field.id, areaHaOnField: 1 } },
    },
  });
  const call = async (route: string, body: unknown) => {
    const response = await fetch(url + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: response.status, payload: await response.json() };
  };
  const operation = {
    companyId,
    date: '2026-10-08',
    reason: 'Synthetic treatment',
    job: { productionUnitId: unit.id, category: 'TREATMENT', quantity: 1, unit: 'ha' },
    movements: [{ productId, type: 'OUT', quantity: 1000, unit: 'g' }],
  };
  const initialStocks = await prisma.stock.count();
  const proposed = await call('/farm/operations', { operation, idempotencyKey: randomUUID() });
  assert.equal(proposed.status, 201, JSON.stringify(proposed.payload));
  assert.equal(await prisma.job.count(), 0);
  assert.equal(await prisma.stock.count(), initialStocks);
  const review = {
    decision: 'approve',
    version: 1,
    negativeReason: 'Synthetic negative balance authorized',
  };
  const [first, duplicate] = await Promise.all([
    call(`/farm/operations/${proposed.payload.data.id}/review`, review),
    call(`/farm/operations/${proposed.payload.data.id}/review`, review),
  ]);
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.equal(duplicate.status, 200);
  assert.equal(await prisma.job.count(), 1);
  assert.equal(await prisma.stock.count(), initialStocks + 1);
  const stock = await prisma.stock.findFirstOrThrow({
    where: { operationId: proposed.payload.data.id },
  });
  assert.equal(stock.jobId, first.payload.data.operation.result.jobId);
  assert.equal(stock.quantityConverted, -1);
  const malformed = await call('/farm/operations', {
    operation: {
      ...operation,
      movements: [
        ...operation.movements,
        { ...operation.movements[0], productId: 'another-company-product' },
      ],
    },
    idempotencyKey: randomUUID(),
  });
  assert.equal(malformed.status, 403);
  assert.equal(await prisma.job.count(), 1);
  assert.equal(await prisma.stock.count(), initialStocks + 1);
  console.log(
    'PASS: concurrent approval creates one activity and one linked consumption; invalid batch writes nothing',
  );
}
