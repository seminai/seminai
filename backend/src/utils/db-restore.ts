import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

const execAsync = promisify(exec);
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;

interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
}

function parseDatabaseUrl(databaseUrl: string): DatabaseConfig {
  try {
    const parsedUrl = new URL(databaseUrl);
    const host = parsedUrl.hostname;
    const port = Number.parseInt(parsedUrl.port || '5432', 10);
    const database = parsedUrl.pathname.slice(1).split('?')[0];
    const username = parsedUrl.username;
    const password = parsedUrl.password;
    if (!host || !database || !username) {
      throw new Error('Invalid DATABASE_URL: missing required components');
    }
    return { host, port, database, username, password: password || '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse DATABASE_URL: ${message}`);
  }
}

function getBackupDirectory(): string {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup directory not found: ${backupDir}`);
  }
  return backupDir;
}

function getBackupPathFromArgs(): string | undefined {
  const argPath = process.argv[2];
  return argPath ? path.resolve(process.cwd(), argPath) : undefined;
}

function getLatestBackupPath(): string {
  const backupDir = getBackupDirectory();
  const sqlFiles = fs
    .readdirSync(backupDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .map((fileName) => path.join(backupDir, fileName));
  if (sqlFiles.length === 0) {
    throw new Error(`No .sql backup files found in ${backupDir}`);
  }
  const latest = sqlFiles
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) {
    throw new Error(`No backup file available in ${backupDir}`);
  }
  return latest.filePath;
}

function resolveBackupPath(): string {
  const fromArgs = getBackupPathFromArgs();
  const backupPath = fromArgs ?? getLatestBackupPath();
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  if (!backupPath.endsWith('.sql')) {
    throw new Error(`Backup file must be a .sql file: ${backupPath}`);
  }
  return backupPath;
}

function isLocalDatabaseHost(host: string): boolean {
  return LOCAL_HOSTS.includes(host as (typeof LOCAL_HOSTS)[number]);
}

function validateLocalTarget(config: DatabaseConfig): void {
  const canRestoreNonLocal = process.env.ALLOW_NON_LOCAL_RESTORE === 'true';
  if (isLocalDatabaseHost(config.host) || canRestoreNonLocal) {
    return;
  }
  throw new Error(
    `Refusing restore to non-local host "${config.host}". Set ALLOW_NON_LOCAL_RESTORE=true to override.`,
  );
}

async function checkPsqlAvailable(): Promise<void> {
  try {
    await execAsync('which psql');
  } catch {
    throw new Error('psql is not available. Please install PostgreSQL client tools.');
  }
}

function getPsqlBaseCommand(config: DatabaseConfig): string {
  return `psql -h ${config.host} -p ${config.port} -U ${config.username} -d ${config.database}`;
}

async function resetPublicSchema(config: DatabaseConfig): Promise<void> {
  const baseCommand = getPsqlBaseCommand(config);
  const resetSchemaSql =
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO CURRENT_USER;';
  await execAsync(`${baseCommand} -v ON_ERROR_STOP=1 -c "${resetSchemaSql}"`, {
    env: { ...process.env, PGPASSWORD: config.password },
  });
}

async function restoreDump(config: DatabaseConfig, backupPath: string): Promise<void> {
  const baseCommand = getPsqlBaseCommand(config);
  await execAsync(`${baseCommand} -v ON_ERROR_STOP=1 -f "${backupPath}"`, {
    env: { ...process.env, PGPASSWORD: config.password },
    maxBuffer: 1024 * 1024 * 20,
  });
}

async function main(): Promise<void> {
  dotenv.config();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const config = parseDatabaseUrl(databaseUrl);
  validateLocalTarget(config);
  const backupPath = resolveBackupPath();
  await checkPsqlAvailable();
  console.log('Restore target');
  console.log(`- Database: ${config.database}`);
  console.log(`- Host: ${config.host}:${config.port}`);
  console.log(`- User: ${config.username}`);
  console.log(`- Backup: ${backupPath}`);
  console.log('Resetting public schema...');
  await resetPublicSchema(config);
  console.log('Restoring dump...');
  await restoreDump(config, backupPath);
  console.log('✓ Database restored successfully.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Error:', message);
  process.exit(1);
});
