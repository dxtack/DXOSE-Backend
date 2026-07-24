'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { discoverWave7Context } = require('./wave7-discover-context');

(async () => {
    const ctx = await discoverWave7Context();
    const res = await fetch('http://127.0.0.1:4000/api/items?page=1&pageSize=50', {
        headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
    });
    const body = await res.json();
    console.log('status', res.status, JSON.stringify(body, null, 2).slice(0, 800));
    const me = await fetch('http://127.0.0.1:4000/api/auth/me', {
        headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
    });
    console.log('me', me.status, JSON.stringify(await me.json(), null, 2).slice(0, 600));
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
