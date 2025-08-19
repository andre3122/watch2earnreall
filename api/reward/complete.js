// api/reward/complete.js
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user)
    return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  // >>> robust body parse
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const { task_id, token } = body;
  if (!task_id || !token)
    return res.status(400).json({ ok:false, error:"BAD_REQUEST" });

  const { rows } = await sql`
    UPDATE ad_sessions
    SET status='await_postback'
    WHERE token=${token} AND user_id=${user.id}
      AND task_id=${task_id}
      AND status IN ('pending','await_postback')
    RETURNING token
  `;
  if (!rows.length)
    return res.status(200).json({ ok:true, awaiting:false, reason:"NO_SESSION" });

  res.status(200).json({ ok:true, awaiting:true, message:"Verifying with ad network..." });
};
