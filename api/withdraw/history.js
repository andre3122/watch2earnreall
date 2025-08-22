// /api/withdraw/history.js
const { sql } = require('../_lib/db');
const { authFromHeader } = require('../_lib/auth');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
    }

    const a = await authFromHeader(req);
    if (!a.ok || !a.user) {
      return res.status(a.status || 401).json({ ok:false, error:'AUTH_FAILED' });
    }
    const uid = a.user.id;

    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const rows = await sql`
      SELECT id,
             amount::numeric AS amount,
             address,
             status,
             created_at
      FROM withdraw_requests
      WHERE user_id = ${uid}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    res.json({ ok:true, items: rows });
  } catch (e) {
    console.error('withdraw/history error:', e);
    res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
