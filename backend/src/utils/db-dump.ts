import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

function parseDatabaseUrl(databaseUrl: string): DatabaseConfig {
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = parseInt(url.port || '5432', 10);
    const database = url.pathname.slice(1).split('?')[0];
    const username = url.username;
    const password = url.password;

    if (!host || !database || !username) {
      throw new Error('Invalid DATABASE_URL: missing required components');
    }

    return {
      host,
      port,
      database,
      username,
      password: password || '',
    };
  } catch (error) {
    throw new Error(
      `Failed to parse DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getBackupDirectory(): string {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function generateBackupFileName(databaseName: string): string {
  const timestamp =
    new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] +
    '_' +
    new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  return `${databaseName}_${timestamp}.sql`;
}

async function checkPgDumpAvailable(): Promise<boolean> {
  try {
    await execAsync('which pg_dump');
    return true;
  } catch {
    return false;
  }
}

async function dumpDatabase(config: DatabaseConfig, outputPath: string): Promise<void> {
  const pgDumpCommand = `pg_dump -h ${config.host} -p ${config.port} -U ${config.username} -d ${config.database} -F p --no-owner --no-acl -f "${outputPath}"`;

  try {
    console.log(`Dumping database ${config.database}...`);
    const { stdout, stderr } = await execAsync(pgDumpCommand, {
      env: { ...process.env, PGPASSWORD: config.password },
    });

    if (stderr && !stderr.includes('WARNING')) {
      console.warn('pg_dump warnings:', stderr);
    }

    if (stdout) {
      console.log(stdout);
    }

    console.log(`✓ Database dump created successfully: ${outputPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to dump database: ${errorMessage}`);
  }
}

async function main(): Promise<void> {
  dotenv.config();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  console.log('Parsing DATABASE_URL...');
  const config = parseDatabaseUrl(databaseUrl);

  console.log(`Database: ${config.database}`);
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`User: ${config.username}`);

  const pgDumpAvailable = await checkPgDumpAvailable();
  if (!pgDumpAvailable) {
    throw new Error('pg_dump is not available. Please install PostgreSQL client tools.');
  }

  const backupDir = getBackupDirectory();
  const backupFileName = generateBackupFileName(config.database);
  const outputPath = path.join(backupDir, backupFileName);

  await dumpDatabase(config, outputPath);

  const stats = fs.statSync(outputPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`Backup file size: ${fileSizeInMB} MB`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
