'use strict';

const fs = require('fs');
const path = require('path');
const { API_BASE, HOTEL_A } = require('./constants');
const { getSession, switchTenant } = require('./http');
const { loadIdentities, identityByKey } = require('./identities');

async function sessionForIdentityKey(key, tenantSlug = HOTEL_A.slug) {
  const data = loadIdentities();
  const ident = identityByKey(data, key);
  if (!ident) return { ok: false, reason: `identity_missing:${key}` };
  const spec = { email: ident.email, password: data.password || ident.password };
  let session = await getSession(
    API_BASE,
    spec,
    key === 'ORG_MANAGER' ? 'dx-hospitality-group' : tenantSlug,
  );
  if (!session.ok) return { ok: false, reason: 'login_failed', loginRes: session.loginRes, key, email: ident.email };

  if (key === 'ORG_MANAGER') {
    const sw = await switchTenant(API_BASE, session.token, tenantSlug);
    if (sw.status !== 200 || !sw.data?.data?.accessToken) {
      return { ok: false, reason: 'org_switch_failed', loginRes: sw, key };
    }
    session = {
      ok: true,
      token: sw.data.data.accessToken,
      user: sw.data.data.user,
      permissions: sw.data.data.user?.permissions || [],
    };
  }

  return {
    ok: true,
    key,
    token: session.token,
    user: session.user,
    permissions: session.permissions || session.user?.permissions || [],
    identity: ident,
  };
}

function requireIdentitiesFile() {
  const data = loadIdentities();
  if (!data) {
    throw new Error('Run 00-seed-test-identities.js first — TEST_IDENTITIES_AND_ASSIGNMENTS.json missing');
  }
  return data;
}

module.exports = { sessionForIdentityKey, requireIdentitiesFile, loadIdentities, identityByKey };
