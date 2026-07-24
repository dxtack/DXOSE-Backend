'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

describe('Retired modules — safe 404', () => {
    let server;
    let baseUrl;

    before(async () => {
        const apiRoutes = require('../../../src/routes');
        const app = express();
        app.use(express.json());
        app.use('/api', apiRoutes);
        app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
        if (server) {
            await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
        }
    });

    it('GET /api/requisitions returns 404', async () => {
        const res = await fetch(`${baseUrl}/api/requisitions`);
        assert.equal(res.status, 404);
    });

    it('GET /api/issues returns 404', async () => {
        const res = await fetch(`${baseUrl}/api/issues`);
        assert.equal(res.status, 404);
    });

    it('POST /api/requisitions returns 404', async () => {
        const res = await fetch(`${baseUrl}/api/requisitions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(res.status, 404);
    });

    it('POST /api/issues returns 404', async () => {
        const res = await fetch(`${baseUrl}/api/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(res.status, 404);
    });
});
