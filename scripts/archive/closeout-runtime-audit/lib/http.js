'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

function apiRequest(baseUrl, method, apiPath, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const base = baseUrl.replace(/\/$/, '');
    const full = `${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    const u = new URL(full);
    const payload = body != null ? JSON.stringify(body) : null;
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extraHeaders,
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let data = null;
          const raw = Buffer.concat(chunks).toString();
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({
            status: res.statusCode,
            data,
            errorCode: data?.code || data?.error?.code || data?.data?.code || null,
            message: data?.message || data?.error?.message || null,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(apiBase, email, password, tenantSlug) {
  const body = { email, password };
  if (tenantSlug) body.tenantSlug = tenantSlug;
  const res = await apiRequest(apiBase, 'POST', '/auth/login', body);
  if (res.status !== 200 || !res.data?.data?.accessToken) {
    const alt = password === 'Admin@123' ? 'Password@123' : 'Admin@123';
    const retry = await apiRequest(apiBase, 'POST', '/auth/login', { email, password: alt, ...(tenantSlug ? { tenantSlug } : {}) });
    if (retry.status === 200 && retry.data?.data?.accessToken) return retry;
    return res;
  }
  return res;
}

async function switchTenant(apiBase, token, tenantSlug) {
  return apiRequest(
    apiBase,
    'POST',
    '/auth/switch-tenant',
    { tenantSlug },
    token,
    { 'X-Tenant-Switch': 'true' },
  );
}

async function getSession(apiBase, userSpec, tenantSlug) {
  let loginRes = await login(apiBase, userSpec.email, userSpec.password, tenantSlug || userSpec.tenantSlug);
  if (loginRes.status !== 200) {
    return { ok: false, loginRes, token: null, user: null, permissions: [] };
  }
  let token = loginRes.data.data.accessToken;
  let user = loginRes.data.data.user;
  if (tenantSlug && user?.tenant?.slug !== tenantSlug) {
    const sw = await switchTenant(apiBase, token, tenantSlug);
    if (sw.status === 200 && sw.data?.data?.accessToken) {
      token = sw.data.data.accessToken;
      user = sw.data.data.user;
    }
  }
  const perms = user?.permissions || loginRes.data.data.user?.permissions || [];
  return { ok: true, token, user, permissions: perms, loginRes };
}

module.exports = { apiRequest, login, switchTenant, getSession };
