export class SeminaiHttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'SeminaiHttpError';
    this.status = status;
    this.body = body;
  }
}

export class SeminaiAuthError extends SeminaiHttpError {
  constructor(body: unknown) {
    super(401, 'Unauthorized: invalid or expired SEMINAI_API_TOKEN', body);
    this.name = 'SeminaiAuthError';
  }
}

export class SeminaiNotFoundError extends SeminaiHttpError {
  constructor(body: unknown) {
    super(404, 'Resource not found', body);
    this.name = 'SeminaiNotFoundError';
  }
}

export class SeminaiTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Seminai API request timed out after ${timeoutMs}ms`);
    this.name = 'SeminaiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
