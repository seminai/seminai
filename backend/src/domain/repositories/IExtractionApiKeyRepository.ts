export interface ExtractionApiKeyRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateExtractionApiKeyInput {
  readonly userId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
}

export interface IExtractionApiKeyRepository {
  create(input: CreateExtractionApiKeyInput): Promise<ExtractionApiKeyRecord>;
  findByIdForUser(id: string, userId: string): Promise<ExtractionApiKeyRecord | null>;
  findByKeyHash(keyHash: string): Promise<ExtractionApiKeyRecord | null>;
  listByUserId(userId: string): Promise<ReadonlyArray<ExtractionApiKeyRecord>>;
  revoke(id: string, userId: string): Promise<ExtractionApiKeyRecord>;
  touchLastUsed(id: string): Promise<void>;
}
