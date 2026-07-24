'use strict';

require('express-async-errors');

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

/**
 * Minimal localhost API for Frontend critical E2E — auth + GRN + items check-requirements only.
 * No product server.js, no scheduler, no workers.
 */
function createE2eApiApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json());
    app.use(cookieParser());

    const authRoutes = require('../../src/routes/auth.routes');
    const grnRoutes = require('../../src/routes/grn.routes');
    const itemRoutes = require('../../src/routes/item.routes');

    app.use('/api/auth', authRoutes);
    app.use('/api/grn', grnRoutes);
    app.use('/api/items', itemRoutes);

    app.use((err, _req, res, _next) => {
        const status = err.statusCode || err.status || 500;
        res.status(status).json({
            success: false,
            message: err.message || 'Internal server error',
            ...(err.code ? { code: err.code, error: err.code } : {}),
        });
    });

    return app;
}

module.exports = { createE2eApiApp };
