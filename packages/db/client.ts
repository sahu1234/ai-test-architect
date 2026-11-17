import path from 'node:path';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function ensureDefaultUser() {
  const existing = await prisma.user.findFirst({
    where: { email: 'architect@aitestarchitect.local' },
  });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: 'architect@aitestarchitect.local',
      name: 'Principal QA Architect',
      role: 'QA_ARCHITECT',
    },
  });
}
