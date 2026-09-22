export type SianFailureReason = 'not_found' | 'transient' | 'invalid_response' | 'parse_error';

interface SianFetchErrorParams {
  readonly reason: SianFailureReason;
  readonly productName: string;
  readonly regNumber: string;
  readonly message?: string;
}

export class SianFetchError extends Error {
  public readonly reason: SianFailureReason;
  public readonly productName: string;
  public readonly regNumber: string;

  constructor(params: SianFetchErrorParams) {
    super(
      params.message ??
        `SIAN fetch failed (${params.reason}) for ${params.productName} (${params.regNumber})`,
    );
    this.name = 'SianFetchError';
    this.reason = params.reason;
    this.productName = params.productName;
    this.regNumber = params.regNumber;
  }
}

export class SianNotFoundError extends SianFetchError {
  constructor(productName: string, regNumber: string, message?: string) {
    super({ reason: 'not_found', productName, regNumber, message });
    this.name = 'SianNotFoundError';
  }
}

export class SianTransientError extends SianFetchError {
  constructor(productName: string, regNumber: string, message?: string) {
    super({ reason: 'transient', productName, regNumber, message });
    this.name = 'SianTransientError';
  }
}

export class SianInvalidResponseError extends SianFetchError {
  constructor(productName: string, regNumber: string, message?: string) {
    super({ reason: 'invalid_response', productName, regNumber, message });
    this.name = 'SianInvalidResponseError';
  }
}

export class SianParseError extends SianFetchError {
  constructor(productName: string, regNumber: string, message?: string) {
    super({ reason: 'parse_error', productName, regNumber, message });
    this.name = 'SianParseError';
  }
}
