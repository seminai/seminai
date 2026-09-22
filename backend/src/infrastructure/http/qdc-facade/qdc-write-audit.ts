export interface QdcWriteAuditEntry {
  readonly userId: string;
  readonly method: string;
  readonly ok: boolean;
  readonly meta?: object;
  readonly error?: string;
}

/** Structured log line for every QDC write performed through the REST facade. */
export function auditQdcWrite(entry: QdcWriteAuditEntry): void {
  console.info(
    JSON.stringify({
      event: 'qdc_write',
      at: new Date().toISOString(),
      userId: entry.userId,
      method: entry.method,
      ok: entry.ok,
      meta: entry.meta ?? {},
      error: entry.error,
    }),
  );
}
