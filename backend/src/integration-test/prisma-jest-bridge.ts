/* eslint-disable */
// @ts-nocheck
/**
 * CJS-compatible Prisma bridge for integration tests.
 *
 * The generated client.ts uses import.meta.url, which Jest CJS cannot load.
 * Integration tests need the real PrismaClient, so this file mirrors the
 * generated client entrypoint without the import.meta bootstrap.
 */
import * as runtime from '@prisma/client/runtime/client';
import * as $Class from '../generated/prisma/internal/class';
import * as Prisma from '../generated/prisma/internal/prismaNamespace';

export * as $Enums from '../generated/prisma/enums';
export * from '../generated/prisma/enums';

export const PrismaClient = $Class.getPrismaClientClass();
export type PrismaClient<
  LogOpts extends Prisma.LogLevel = never,
  OmitOpts extends Prisma.PrismaClientOptions['omit'] = Prisma.PrismaClientOptions['omit'],
  ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs,
> = $Class.PrismaClient<LogOpts, OmitOpts, ExtArgs>;
export { Prisma };
