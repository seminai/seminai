import type { Request } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import {
  isValidAgrofamacoUdm,
  isValidFertilizzanteUdm,
} from '../../services/integrations/qdc_imageline';
import type {
  QdcTipoFertilizzante,
  QdcTipoScarico,
  QdcUnitaMisuraAgrofarmaco,
  QdcUnitaMisuraFertilizzante,
} from '../../services/integrations/qdc_imageline';

const TIPO_SCARICO = ['reso', 'contoterzi', 'altro'] as const;
const TIPO_FERTILIZZANTE: readonly QdcTipoFertilizzante[] = [
  'Concime chimico',
  'Concime organico',
  'Concime organo-minerale',
  'Ammendante',
  'Correttivo',
  'Substrato di coltivazione',
  'Biostimolante',
  'Prodotto ad azione specifica',
  'Concime CE',
  'Concime nazionale',
  'Fertilizzante biologico',
  'Altro fertilizzante',
  'Concime a lenta cessione',
  'Concime a rilascio controllato',
];

export function parsePositiveInt(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw AppError.badRequest(`${name} must be a positive integer`, 'INVALID_PARAM');
  }
  return parsed;
}

export function parseOptionalPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return parsePositiveInt(value, name);
}

export function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function parseRequiredString(value: unknown, name: string): string {
  const text = parseOptionalString(value);
  if (!text) {
    throw AppError.badRequest(`${name} is required`, 'INVALID_PARAM');
  }
  return text;
}

export function parseOptionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  throw AppError.badRequest(`${name} must be a boolean`, 'INVALID_PARAM');
}

export function parseIdList(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => parsePositiveInt(item, 'listaIdUnita'));
}

export function parseIdAziendaFrom(request: Request): number {
  return parsePositiveInt(request.query.idAzienda ?? request.params.idAzienda, 'idAzienda');
}

export function parseAgrofarmacoUdm(value: unknown): QdcUnitaMisuraAgrofarmaco {
  const udm = parseRequiredString(value, 'udm');
  if (!isValidAgrofamacoUdm(udm)) {
    throw AppError.badRequest('udm must be KG, L or N', 'INVALID_PARAM');
  }
  return udm;
}

export function parseFertilizzanteUdm(value: unknown): QdcUnitaMisuraFertilizzante {
  const udm = parseRequiredString(value, 'udm');
  if (!isValidFertilizzanteUdm(udm)) {
    throw AppError.badRequest('udm must be KG, L, MC or N', 'INVALID_PARAM');
  }
  return udm;
}

export function parseTipoScarico(value: unknown): QdcTipoScarico | undefined {
  const raw = parseOptionalString(value);
  if (!raw) {
    return undefined;
  }
  if (!TIPO_SCARICO.includes(raw as QdcTipoScarico)) {
    throw AppError.badRequest('tipoScarico must be reso, contoterzi or altro', 'INVALID_PARAM');
  }
  return raw as QdcTipoScarico;
}

export function parseTipoFertilizzante(value: unknown): QdcTipoFertilizzante {
  const raw = parseRequiredString(value, 'tipo');
  if (!TIPO_FERTILIZZANTE.includes(raw as QdcTipoFertilizzante)) {
    throw AppError.badRequest('tipo is not a valid QDC fertilizer type', 'INVALID_PARAM');
  }
  return raw as QdcTipoFertilizzante;
}

export function parseFiniteNumber(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw AppError.badRequest(`${name} must be a number`, 'INVALID_PARAM');
  }
  return parsed;
}
