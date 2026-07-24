'use strict';

const userName = (u) => {
    if (!u) return null;
    const t = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return t || null;
};

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

module.exports = {
    userName,
    num,
};
