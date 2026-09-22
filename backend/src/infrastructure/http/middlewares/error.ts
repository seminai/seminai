import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';

function mapPrismaError(err: Error): AppError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }
  if (err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target)
      ? (err.meta.target as string[]).join(', ')
      : String(err.meta?.target ?? 'unique constraint');
    if (target.includes('productionUnitId') && target.includes('fieldId')) {
      return AppError.badRequest(
        'Duplicate field allocation in the same production unit',
        'DUPLICATE_FIELD_ALLOCATION',
      );
    }
    return AppError.badRequest(
      `Unique constraint violation on ${target}`,
      'UNIQUE_CONSTRAINT_VIOLATION',
    );
  }
  return null;
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    if (err.statusCode < 500) {
      console.warn(
        `[${req.method} ${req.originalUrl}] ${err.statusCode} ${err.code ?? 'APP_ERROR'}: ${err.message}`,
      );
    } else {
      console.error('Error:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
    }

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      code: err.code,
      ...(isDevelopment && { stack: err.stack }),
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    console.warn(`[${req.method} ${req.originalUrl}] 400 INVALID_JSON: ${err.message}`);
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON',
      code: 'INVALID_JSON',
    });
  }

  const mappedPrismaError = mapPrismaError(err);
  if (mappedPrismaError) {
    console.warn(
      `[${req.method} ${req.originalUrl}] ${mappedPrismaError.statusCode} ${mappedPrismaError.code ?? 'APP_ERROR'}: ${mappedPrismaError.message}`,
    );
    return res.status(mappedPrismaError.statusCode).json({
      status: 'error',
      message: mappedPrismaError.message,
      code: mappedPrismaError.code,
      ...(isDevelopment && { stack: err.stack }),
    });
  }

  console.error('Error:', {
    name: err.name,
    message: err.message,
    stack: isDevelopment ? err.stack : undefined,
  });

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: err.stack }),
  });
};
