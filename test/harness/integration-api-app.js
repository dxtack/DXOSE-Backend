'use strict';

/**
 * Full tenant API for integration/runtime tests — no scheduler, no listen().
 */
require('express-async-errors');

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { errorHandler } = require('../../src/middleware/errorHandler');
const { notFound } = require('../../src/middleware/notFound');
const routes = require('../../src/routes');
const adminRoutes = require('../../src/routes/superAdmin.routes');
const { isLocalDriver } = require('../../src/config/storage');

function createIntegrationApiApp() {
    const app = express();
    app.set('trust proxy', 1);

    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );
    app.use(
        cors({
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        }),
    );

    const isDev = (process.env.NODE_ENV || 'development') !== 'production';
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5000,
        message: { success: false, message: 'Too many requests, please try again later.' },
    });
    app.use('/api', limiter);

    const authLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5000,
        skip: () => isDev,
        message: { success: false, message: 'Too many login attempts, please try again later.' },
    });
    app.use('/api/auth/login', authLimiter);

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(cookieParser());

    if (isLocalDriver()) {
        app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
    }

    app.use(
        morgan('tiny', {
            stream: { write: () => {} },
        }),
    );

    app.get('/health', (_req, res) => {
        res.json({ success: true, message: 'integration-api', timestamp: new Date().toISOString() });
    });

    app.use('/api/admin', adminRoutes);
    app.use('/api', routes);
    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createIntegrationApiApp };
