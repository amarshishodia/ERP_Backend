// Singleton Prisma Client
// All files should import prisma from this module instead of creating new PrismaClient() instances.
// This prevents "Too many connections" errors by reusing a single connection pool.

const { PrismaClient } = require("@prisma/client");

let prisma;

if (process.env.NODE_ENV === "production") {
    prisma = new PrismaClient();
} else {
    // In development, reuse the client across hot-reloads (nodemon restarts)
    if (!global.__prisma) {
        global.__prisma = new PrismaClient();
    }
    prisma = global.__prisma;
}

module.exports = prisma;
