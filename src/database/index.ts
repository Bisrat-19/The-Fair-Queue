import net from "node:net";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./client/client";

// Neon has several IPs per host. Node's default gives each one only 250 ms to
// connect, which fails on slower networks. Give each attempt 3 seconds.
net.setDefaultAutoSelectFamilyAttemptTimeout(3_000);

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

const TRANSIENT = new Set(["ETIMEDOUT", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "P1001", "P1017", "P2028"]);

function isTransient(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return (
    TRANSIENT.has(err?.code ?? "") ||
    TRANSIENT.has(err?.cause?.code ?? "") ||
    /Connection terminated|timeout exceeded when trying to connect/i.test(err?.message ?? "")
  );
}

/**
 * Retry an operation if the network to the database drops.
 * Safe for our writes: a failed transaction is rolled back before we retry.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

export type { Prisma, PrismaClient } from "./client/client";
