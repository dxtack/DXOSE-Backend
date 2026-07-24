'use strict';

/**
 * In-process HTTP injection for Express apps — no listening port, no supertest.
 */

function createInject(app) {
    return function inject({ method = 'GET', path, headers = {}, body = undefined, query = {} }) {
        return new Promise((resolve, reject) => {
            const queryString = new URLSearchParams(query).toString();
            const url = queryString ? `${path}?${queryString}` : path;

            const req = {
                method: method.toUpperCase(),
                url,
                originalUrl: url,
                baseUrl: '',
                path: path.split('?')[0],
                headers: { host: '127.0.0.1', ...headers },
                query,
                params: {},
                body: body !== undefined ? body : {},
                get(headerName) {
                    const key = String(headerName || '').toLowerCase();
                    return this.headers[key];
                },
                header(headerName) {
                    return this.get(headerName);
                },
            };

            if (body !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
                req.headers['content-type'] = req.headers['content-type'] || 'application/json';
            }

            let settled = false;
            const finish = (payload) => {
                if (settled) return;
                settled = true;
                resolve(payload);
            };

            const res = {
                statusCode: 200,
                _headers: {},
                body: undefined,
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                json(payload) {
                    this.body = payload;
                    finish({ status: this.statusCode, body: payload, headers: { ...this._headers } });
                    return this;
                },
                send(payload) {
                    this.body = payload;
                    finish({ status: this.statusCode, body: payload, headers: { ...this._headers } });
                    return this;
                },
                setHeader(name, value) {
                    this._headers[name] = value;
                },
                getHeader(name) {
                    return this._headers[name];
                },
                end(payload) {
                    if (payload !== undefined) this.body = payload;
                    finish({ status: this.statusCode, body: this.body, headers: { ...this._headers } });
                },
            };

            app.handle(req, res, (err) => {
                if (err) {
                    if (!settled) reject(err);
                    return;
                }
                if (!settled) {
                    finish({ status: res.statusCode, body: res.body, headers: { ...res._headers } });
                }
            });
        });
    };
}

module.exports = { createInject };
