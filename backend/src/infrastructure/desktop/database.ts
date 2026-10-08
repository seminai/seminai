import { Pool } from 'pg';
let pool: Pool | undefined;
/** A small local pool, shared by queue metadata and transient state. */
export function getDesktopPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}
export async function closeDesktopPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
