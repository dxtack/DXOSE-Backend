'use strict';

require('./preload');

const { createIntegrationApiApp } = require('./integration-api-app');
const { ensureAccRuntimeConfigLoaded } = require('../../src/services/acc-runtime-config.service');

const host = process.env.INTEGRATION_API_HOST ?? '127.0.0.1';
const port = Number(process.env.INTEGRATION_API_PORT ?? 4010);

async function main() {
    try {
        await ensureAccRuntimeConfigLoaded();
    } catch {
        // non-fatal for isolation tests
    }

    const app = createIntegrationApiApp();
    const server = app.listen(port, host, () => {
        process.stdout.write(`[integration-api] listening on http://${host}:${port}\n`);
    });

    function shutdown(signal) {
        process.stdout.write(`[integration-api] shutting down (${signal})\n`);
        server.close(() => process.exit(0));
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    console.error('[integration-api] fatal:', err);
    process.exit(1);
});
