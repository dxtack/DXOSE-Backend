'use strict';

const express = require('express');

/**
 * Minimal in-process app mounting the actual GRN router at /api/grn.
 * No scheduler, workers, or product HTTP server.
 */
function createGrnApiApp() {
    const app = express();
    app.use(express.json());
    const grnRoutes = require('../../src/routes/grn.routes');
    app.use('/api/grn', grnRoutes);
    return app;
}

module.exports = { createGrnApiApp };
