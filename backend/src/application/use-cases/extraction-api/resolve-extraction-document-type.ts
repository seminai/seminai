import type {
  ExtractionApiDocumentType,
  ExtractionApiResolvedDocumentType,
} from '../../../domain/dtos/extraction-api.dto';
import { AppError } from '../../../domain/errors/AppError';
import { resolveFileCategory } from '../../../infrastructure/services/extraction/file-category-resolver';

export async function resolveExtractionApiDocumentType(params: {
  readonly requestedType: ExtractionApiDocumentType;
  readonly fileBuffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
}): Promise<ExtractionApiResolvedDocumentType> {
  if (params.requestedType === 'invoice' || params.requestedType === 'ddt') {
    return params.requestedType;
  }
  const resolved = await resolveFileCategory({
    userCategory: 'auto',
    fileBuffer: params.fileBuffer,
    mimeType: params.mimeType,
    fileName: params.fileName,
  });
  if (resolved.category === 'invoice' || resolved.category === 'ddt') {
    return resolved.category;
  }
  throw AppError.badRequest(
    'Auto-detect could not classify document as invoice or DDT',
    'UNSUPPORTED_DOCUMENT_TYPE',
  );
}
