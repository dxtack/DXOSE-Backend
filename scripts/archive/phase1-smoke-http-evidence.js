/**
 * One-off HTTP smoke for Phase 1 inventory count stabilization evidence.
 * Run with: node scripts/phase1-smoke-http-evidence.js
 * Optional: BASE_URL=http://localhost:4010/api for second server with env flags.
 */
const BASE = process.env.BASE_URL || 'http://localhost:4000/api';

async function httpJson(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data };
}

async function login() {
  const { status, data } = await httpJson('POST', '/auth/login', {
    body: { email: 'admin@grandhorizon.com', password: 'Admin@123', tenantSlug: 'grand-horizon' },
  });
  if (status !== 200) throw new Error(`Login failed ${status}: ${JSON.stringify(data)}`);
  return data.data.accessToken;
}

async function main() {
  const out = { baseUrl: BASE, at: new Date().toISOString(), steps: [] };
  const token = await login();

  // Locations
  const locRes = await httpJson('GET', '/locations', { token });
  const loc = locRes.data.data[0];
  if (!loc?.departmentId) {
    throw new Error('First location has no departmentId — pick another seed');
  }
  out.steps.push({
    name: 'GET /locations',
    status: locRes.status,
    locationId: loc.id,
    departmentId: loc.departmentId,
  });

  // Canonical create
  const icBody = {
    departmentId: loc.departmentId,
    categoryId: null,
    locationIds: [loc.id],
    blindMode: true,
    notes: 'Phase1 smoke evidence',
  };
  const icRes = await httpJson('POST', '/inventory-count/sessions', { token, body: icBody });
  out.steps.push({
    name: 'POST /inventory-count/sessions',
    status: icRes.status,
    sessionId: icRes.data?.id,
    sessionNo: icRes.data?.sessionNo,
    responseStatus: icRes.data?.status,
    error: icRes.data?.error,
  });

  // Legacy create (behavior depends on BLOCK_LEGACY_STOCK_COUNT_CREATE on server)
  let legacyCreate;
  const lr = await httpJson('POST', '/stock-count', {
    token,
    body: { locationId: loc.id, notes: 'phase1 legacy probe' },
  });
  if (lr.status === 403) {
    legacyCreate = {
      status: lr.status,
      blocked: true,
      code: lr.data?.error?.code,
      message: lr.data?.message || lr.data?.error?.message,
    };
  } else if (lr.status === 201) {
    legacyCreate = { status: lr.status, blocked: false, code: null, sessionNo: lr.data?.data?.sessionNo };
  } else {
    legacyCreate = { status: lr.status, blocked: false, body: lr.data };
  }
  out.steps.push({ name: 'POST /stock-count (legacy create)', ...legacyCreate });

  // Legacy evidence GET (session may not exist for evidence — use list first)
  const list = await httpJson('GET', '/stock-count?limit=1', { token });
  const inner = list.data?.data;
  const sid = inner?.data?.[0]?.id;
  let evidenceProbe = { skipped: true };
  if (sid) {
    const ev = await httpJson('GET', `/stock-count/${sid}/evidence`, { token });
    evidenceProbe = { status: ev.status, skipped: false, sessionId: sid };
  }
  out.steps.push({ name: 'GET /stock-count/:id/evidence (if session exists)', ...evidenceProbe });

  out.telemetryNote =
    'If LEGACY_STOCK_COUNT_TELEMETRY=1 on server, inspect Winston logs for legacy_stock_count_api after this script runs.';

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message, stack: e.stack }, null, 2));
  process.exit(1);
});
