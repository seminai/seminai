export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code?: string): AppError {
    return new AppError(400, message, code);
  }

  static unauthorized(message: string, code?: string): AppError {
    return new AppError(401, message, code);
  }

  static forbidden(message: string, code?: string): AppError {
    return new AppError(403, message, code);
  }

  static paymentRequired(message: string, code?: string): AppError {
    return new AppError(402, message, code);
  }

  static notFound(message: string, code?: string): AppError {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(409, message, code);
  }

  static tooManyRequests(message: string, code?: string): AppError {
    return new AppError(429, message, code);
  }

  static internal(message: string, code?: string): AppError {
    return new AppError(500, message, code);
  }

  static serviceUnavailable(message: string, code?: string): AppError {
    return new AppError(503, message, code);
  }

  static featureNotConfigured(feature: string): AppError {
    return AppError.serviceUnavailable(`${feature} is not configured`, 'feature_not_configured');
  }
}
