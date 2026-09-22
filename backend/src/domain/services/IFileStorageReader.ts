/** Internal extension used by processors that need the stored bytes. */
export interface IFileStorageReader {
  /** Reads bytes only after validating the tenant encoded by the stable URL. */
  read(input: {
    readonly tenantId: string;
    readonly url: string;
  }): Promise<{ readonly content: Uint8Array; readonly name: string; readonly contentType: string }>;
}
