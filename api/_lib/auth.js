// api/_lib/auth.js
const { getUserOrCreate } = require('./db');
const { parseInitData } = require('./telegram');

async function authFromHeader(req) {
  try {
    // Test header path
    const testHeader = req.headers['x-telegram-test-user'];
    if (testHeader) {
      let user;
      if (typeof testHeader === 'string') {
        try { user = JSON.parse(testHeader); } catch {}
      }
      if (!user && typeof testHeader === 'object') user = testHeader;
      if (user && user.id) {
        const u = await getUserOrCreate({ id: String(user.id), username: user.username || null });
        return { ok: true, user: u };
      }
    }

    // Real Telegram init data
    const init = req.headers['x-telegram-init-data'];
    if (init) {
      const parsed = parseInitData(init);
      if (parsed && parsed.user && parsed.user.id) {
        const u = await getUserOrCreate({ id: String(parsed.user.id), username: parsed.user.username || null });
        return { ok: true, user: u };
      }
      return { ok: false, status: 401, error: 'AUTH_CRASH' };
    }
    return { ok: false, status: 401, error: 'AUTH_FAILED' };
  } catch (e) {
    return { ok: false, status: 500, error: 'AUTH_CRASH' };
  }
}

module.exports = { authFromHeader };
