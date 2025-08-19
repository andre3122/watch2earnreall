// api/checkin/claim.js
const { sql, addBalance } = require('../_lib/db');
const { authFromHeader } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:"AUTH_FAILED" });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ ok:false, error:"BAD_REQUEST" });

  const { rows } = await sql`
    UPDATE ad_sessions
    SET status='await_postback'
    WHERE token=${token} AND user_id=${a.user.id}
      AND task_id LIKE 'checkin:%'
      AND status IN ('pending','await_postback')
    RETURNING token`;

  if (!rows.length) return res.status(200).json({ ok:true, awaiting:false, reason:"NO_SESSION" });
  res.status(200).json({ ok:true, awaiting:true, message:"Verifying with ad network..." });
};
