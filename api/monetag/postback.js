// api/monetag/postback.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    // Monetag call: GET ?subid=<token>&payout=<nominal>
    const { subid, payout, amount } = req.query || {};
    const token = String(subid || "").trim();
    const reward = Number(payout ?? amount ?? 0);

    if (!token) return res.status(200).send("NO_TOKEN");       // selalu 200 biar adnet happy
    if (!(reward > 0)) return res.status(200).send("NO_AMOUNT");

    const { rows } = await sql`
      SELECT id, user_id, task_id, reward
      FROM ad_sessions
      WHERE token=${token} AND status='await_postback'
      LIMIT 1
    `;
    if (!rows.length) return res.status(200).send("NO_SESSION");

    const { id: session_id, user_id, task_id } = rows[0];

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO task_completions (user_id, task_id, amount)
        VALUES (${user_id}, ${task_id}, ${reward}::numeric)
      `;
      await tx`
        UPDATE users SET balance = balance + ${reward}::numeric
        WHERE id=${user_id}
      `;
      await tx`
        UPDATE ad_sessions SET status='completed'
        WHERE id=${session_id}
      `;
    });

    return res.status(200).send("OK");
  } catch (e) {
    console.error("postback error:", e);
    // Jangan 500, kembalikan 200 agar adnet anggap sukses, tapi log tetap ada
    return res.status(200).send("ERROR_INTERNAL");
  }
};
