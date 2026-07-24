'use strict';

const express = require('express');
require('express-async-errors');
const { errorHandler } = require('../../src/middleware/errorHandler');

/** Minimal in-process app mounting movement + ledger routes. */
function createMovementApiApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/movements', require('../../src/routes/movement.routes'));
    app.use('/api/ledger', require('../../src/routes/ledger.routes'));
    app.use(errorHandler);
    return app;
}

module.exports = { createMovementApiApp };
