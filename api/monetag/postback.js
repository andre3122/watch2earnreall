// api/monetag/postback.js — Monetag postback
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const param = process.env.MONETAG_TOKEN_PARAM || "subid";
    const token = (req.query?.[param] || "").toString().trim();
    if (!token) return res.status(400).send("missing-token");

    const rewardFlag = String(req.query?.reward || "").toLowerCase();
    if (rewardFlag && rewardFlag !== "valued") return res.status(200).send("ignored");

    const { rows } = await sql`
      SELECT id, user_id, reward, status
      FROM ad_sessions
      WHERE token = ${token}
      LIMIT 1
    `;
    if (rows.length === 0) return res.status(404).send("unknown-session");

    const s = rows[0];
    if (s.status === "credited") return res.status(200).send("ok");

    await sql`INSERT INTO ledger (user_id, amount, reason, ref_id)
              VALUES (${s.user_id}, ${s.reward}, 'ad_complete', ${token})`;
    await sql`UPDATE users SET balance = balance + ${s.reward}::numeric, updated_at = now()
              WHERE id = ${s.user_id}`;
    await sql`UPDATE ad_sessions SET status = 'credited', completed_at = now()
              WHERE id = ${s.id}`;

    res.status(200).send("ok");
  } catch (e) {
    console.error("postback error:", e);
    res.status(500).send("error-postback");
  }
};
