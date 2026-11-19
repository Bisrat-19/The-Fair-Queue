import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      // Neon sleeps when idle; the first connection can take a few seconds to wake it.
      connectionTimeoutMillis: 20_000,
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
