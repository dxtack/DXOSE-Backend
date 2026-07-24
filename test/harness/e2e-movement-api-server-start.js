'use strict';

require('./preload');

const { createE2eMovementApiApp } = require('./e2e-movement-api-server');

const host = process.env.E2E_API_HOST ?? '127.0.0.1';
const port = Number(process.env.E2E_API_PORT ?? 4002);

const app = createE2eMovementApiApp();
const server = app.listen(port, host, () => {
    process.stdout.write(`[e2e-movement-api] listening on http://${host}:${port}\n`);
});

function shutdown(signal) {
    process.stdout.write(`[e2e-movement-api] shutting down (${signal})\n`);
    server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
