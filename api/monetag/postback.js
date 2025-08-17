// api/postback/monetag.js
const crypto = require("crypto");
const { sql } = require("../_lib/db");

// Param token dari Monetag (default: subid)
const TOKEN_PARAM = process.env.MONETAG_TOKEN_PARAM || "subid";
// Optional signature sederhana
const SECRET = process.env.MONETAG_SECRET || "";

function verifySignature(query) {
  if (!SECRET) return true;
  const token = String(query[TOKEN_PARAM] || "");
  const sig   = String(query.sig || "");
  if (!sig || !token) return false;
  const calc  = crypto.createHash("sha256").update(token + SECRET).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(calc)); }
  catch { return false; }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

module.exports = async (req, res) => {
  try {
    const token = String(req.query[TOKEN_PARAM] || "");
    if (!token) return res.status(400).send("no-token");
    if (!verifySignature(req.query)) return res.status(403).send("bad-signature");

    const { rows: s } = await sql`
      SELECT id, user_id, task_id, reward, status
      FROM ad_sessions WHERE token=${token} LIMIT 1
    `;
    if (!s.length) return res.status(200).send("unknown-session");

    const sess = s[0];
    if (["credited","rejected","expired"].includes(sess.status)) return res.status(200).send("already-final");

    const isCheckin = String(sess.task_id || "").startsWith("checkin:");
    if (!isCheckin) {
      // === TASK biasa (ads reward $0.01) ===
      await sql`UPDATE users SET balance = balance + ${sess.reward}::numeric, updated_at = now()
                WHERE id = ${sess.user_id}`;
      await sql`INSERT INTO task_logs (user_id, task_id, amount)
                VALUES (${sess.user_id}, ${sess.task_id}, ${sess.reward}::numeric)`;
      await sql`UPDATE ad_sessions SET status='credited', completed_at=now() WHERE id=${sess.id}`;
      return res.status(200).send("ok");
    }

    // === CHECK-IN ===
    const today = todayStr();

    // Ambil data user
    const { rows: ur } = await sql`
      SELECT balance, streak, last_checkin FROM users WHERE id=${sess.user_id} LIMIT 1
    `;
    const last = ur?.[0]?.last_checkin ? String(ur[0].last_checkin).slice(0,10) : null;
    if (last === today) {
      await sql`UPDATE ad_sessions SET status='rejected', completed_at=now() WHERE id=${sess.id}`;
      return res.status(200).send("already-checked-in");
    }

    // Kredit + naikkan streak
    await sql`
      UPDATE users
      SET balance = balance + ${sess.reward}::numeric,
          streak = LEAST(9, COALESCE(streak,0) + 1),
          last_checkin = now(),
          updated_at = now()
      WHERE id = ${sess.user_id}
    `;
    await sql`UPDATE ad_sessions SET status='credited', completed_at=now() WHERE id=${sess.id}`;
    return res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    return res.status(500).send("error");
  }
};
