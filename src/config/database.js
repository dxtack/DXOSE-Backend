require('dotenv').config();

// Windows + Docker Desktop: localhost may resolve to IPv6; host-mapped Postgres uses 127.0.0.1:5433.
if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/@localhost:/gi, '@127.0.0.1:');
}

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const globalForPrisma = global;

const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
        ],
    });

if (process.env.NODE_ENV !== 'production') {
    prisma.$on('query', (e) => {
        if (process.env.LOG_QUERIES === 'true') {
            logger.debug(`Query: ${e.query} | Duration: ${e.duration}ms`);
        }
    });
}

prisma.$on('error', (e) => {
    logger.error('Prisma error:', e);
});

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

module.exports = prisma;
