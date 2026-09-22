/** Stable storage port used by application services. */
export interface IFileStorage {
  /** Stores an object in a tenant-isolated namespace. */
  upload(input: {
    readonly tenantId: string;
    readonly path: string;
    readonly name: string;
    readonly contentType: string;
    readonly content: Uint8Array;
  }): Promise<{ readonly url: string; readonly key: string }>;

  /** Deletes an object after validating its tenant ownership. */
  delete(input: { readonly tenantId: string; readonly url: string }): Promise<void>;

  /** Returns a time-limited URL that can read an object. */
  getReadUrl(input: {
    readonly tenantId: string;
    readonly url: string;
    readonly expiresInSeconds?: number;
  }): Promise<string>;

  /** Checks whether a tenant-owned object exists. */
  exists(input: { readonly tenantId: string; readonly url: string }): Promise<boolean>;

  /** Lists objects below a tenant-owned prefix. */
  list(input: {
    readonly tenantId: string;
    readonly path?: string;
  }): Promise<readonly { readonly name: string; readonly url: string; readonly size: number }[]>;
}
