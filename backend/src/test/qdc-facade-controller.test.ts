import type { Request, Response } from 'express';
import { AppError } from '../domain/errors/AppError';
import { QdcLicenzaFacadeController } from '../infrastructure/http/controllers/qdc-facade/QdcLicenzaFacadeController';
import { QdcMagazzinoAgrofarmaciFacadeController } from '../infrastructure/http/controllers/qdc-facade/QdcMagazzinoAgrofarmaciFacadeController';
import { resolveQdcApiForUser } from '../infrastructure/http/qdc-facade/resolve-qdc-api';
import type { QdcImageLineRestApi } from '../infrastructure/services/integrations/qdc_imageline';
import { QdcApiError } from '../infrastructure/services/integrations/qdc_imageline';

jest.mock('../infrastructure/http/qdc-facade/resolve-qdc-api', () => ({
  resolveQdcApiForUser: jest.fn(),
}));

const mockResolve = resolveQdcApiForUser as jest.MockedFunction<typeof resolveQdcApiForUser>;

function buildResponse(): { response: Response; jsonMock: jest.Mock } {
  const jsonMock = jest.fn();
  const response = { json: jsonMock, status: jest.fn().mockReturnThis() } as unknown as Response;
  return { response, jsonMock };
}

const AUTH_REQUEST = {
  user: { id: 'user-1' },
  query: {},
  params: {},
  body: {},
} as unknown as Request;

function mockApi(partial: Partial<QdcImageLineRestApi['licenza']> & Record<string, unknown>): void {
  mockResolve.mockResolvedValue({
    licenza: partial,
    magazzinoAgrofarmaci: partial,
  } as unknown as QdcImageLineRestApi);
}

describe('QdcLicenzaFacadeController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns structured companies from getAziende', async () => {
    mockApi({
      getLicenzaAziende: jest.fn().mockResolvedValue({
        message: 'ok',
        result: {
          COLUMNS: ['ID', 'AZIENDA', 'PIVA', 'CF', 'VALIDADA', 'VALIDAA'],
          DATA: [[7, 'Acme', '0123', 'CF', '01/01/2020', '31/12/2030']],
        },
      }),
    });
    const { response, jsonMock } = buildResponse();
    await new QdcLicenzaFacadeController().getAziende(AUTH_REQUEST, response);
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'success',
      data: {
        count: 1,
        companies: [expect.objectContaining({ id: 7, azienda: 'Acme', piva: '0123' })],
      },
    });
  });

  it('maps QdcApiError to AppError on getLicenzaInfo', async () => {
    mockApi({
      getLicenzaInfo: jest
        .fn()
        .mockRejectedValue(
          new QdcApiError({ httpStatus: 403, code: 'access_denied', errorDescription: 'no' }),
        ),
    });
    const { response } = buildResponse();
    const actual = await new QdcLicenzaFacadeController()
      .getLicenzaInfo(AUTH_REQUEST, response)
      .catch((error: unknown) => error);
    expect(actual).toBeInstanceOf(AppError);
    expect((actual as AppError).statusCode).toBe(403);
    expect((actual as AppError).code).toBe('access_denied');
  });

  it('rejects unauthenticated requests', async () => {
    const { response } = buildResponse();
    const actual = await new QdcLicenzaFacadeController()
      .getLicenzaInfo({} as Request, response)
      .catch((error: unknown) => error);
    expect(actual).toBeInstanceOf(AppError);
    expect((actual as AppError).statusCode).toBe(401);
  });
});

describe('QdcMagazzinoAgrofarmaciFacadeController.setCarico', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards a carico write to the QDC client', async () => {
    const setCaricoAgrofarmaco = jest.fn().mockResolvedValue({ message: 'ok' });
    mockApi({ setCaricoAgrofarmaco });
    const { response, jsonMock } = buildResponse();
    const request = {
      user: { id: 'user-1' },
      body: {
        idAzienda: 7,
        dataCarico: '01/03/2026',
        numreg: 12345,
        qta: 2.5,
        udm: 'L',
      },
    } as unknown as Request;
    await new QdcMagazzinoAgrofarmaciFacadeController().setCarico(request, response);
    expect(setCaricoAgrofarmaco).toHaveBeenCalledWith(
      expect.objectContaining({ idAzienda: 7, numreg: 12345, qta: 2.5, udm: 'L' }),
    );
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'success',
      data: { message: 'ok', result: null, records: [] },
    });
  });
});
