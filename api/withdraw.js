// /api/withdraw.js  — GET: history, POST: submit request
const { sql } = require('./_lib/db');
const { authFromHeader } = require('./_lib/auth');

module.exports = async (req, res) => {
  try {
    const a = await authFromHeader(req);
    if (!a.ok || !a.user) {
      return res.status(a.status || 401).json({ ok:false, error:'AUTH_FAILED' });
    }
    const uid = a.user.id;

    // ---- GET /api/withdraw  -> riwayat ----
    if (req.method === 'GET') {
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
      return res.json({ ok:true, items: rows });
    }

    // ---- POST /api/withdraw  -> submit request ----
    if (req.method === 'POST') {
      let body = {};
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
      const amount  = Number(body.amount || 0);
      const address = (body.address || '').trim();

      if (!amount || amount < 1) return res.status(400).json({ ok:false, error:'MIN_1_USD' });
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ ok:false, error:'BAD_ADDRESS' });

      await sql`
        INSERT INTO withdraw_requests (user_id, amount, address, status)
        VALUES (${uid}, ${amount}, ${address}, 'pending')
      `;

      return res.json({ ok:true, submitted:true });
    }

    return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  } catch (e) {
    console.error('withdraw handler error:', e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
