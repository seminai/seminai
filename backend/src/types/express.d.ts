/// <reference types="express" />

declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email?: string;
      name?: string;
      role?: import('@prisma/client').UserRole;
    };
  }
}
