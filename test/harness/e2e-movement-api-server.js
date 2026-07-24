'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('express-async-errors');
const { errorHandler } = require('../../src/middleware/errorHandler');

/**
 * Localhost API for Movement Adjustment browser E2E — auth, movements, ledger, items, locations.
 */
function createE2eMovementApiApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json());
    app.use(cookieParser());

    app.use('/api/auth', require('../../src/routes/auth.routes'));
    app.use('/api/items', require('../../src/routes/item.routes'));
    app.use('/api/locations', require('../../src/routes/location.routes'));
    app.use('/api/movements', require('../../src/routes/movement.routes'));
    app.use('/api/ledger', require('../../src/routes/ledger.routes'));
    app.use('/api/stock-balances', require('../../src/routes/stock.routes'));

    app.use(errorHandler);
    return app;
}

module.exports = { createE2eMovementApiApp };
