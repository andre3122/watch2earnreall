// api/monetag/postback.js
const { sql } = require("../_lib/db");

/**
 * Monetag/S2S postback
 * Menerima GET.
 * Param token: subid (default) / click_id (fallback) / ENV MONETAG_TOKEN_PARAM.
 * Param nilai: payout (usd) atau amount.
 */
module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("error-postback: method");
    }

    const q = req.query || {};
    const tokenParam = process.env.MONETAG_TOKEN_PARAM || "subid";
    const token =
      q[tokenParam] || q.subid || q.click_id || "";

    if (!token) return res.status(400).send("error-postback: no_token");

    // angka reward dari jaringan iklan (opsional)
    let credit = Number(q.payout || q.amount || 0);
    if (!Number.isFinite(credit)) credit = 0;

    // Ambil & lock sesi; hanya yang sedang await_postback
    const { rows } = await sql`
      UPDATE ad_sessions
      SET status = 'confirmed'
      WHERE token = ${token}
        AND status = 'await_postback'
      RETURNING user_id, task_id, reward
    `;
    if (!rows.length) return res.status(400).send("error-postback: NO_SESSION");

    const { user_id, task_id, reward } = rows[0];
    if (!credit || credit <= 0) credit = Number(reward || 0);
    if (!credit || credit <= 0) return res.status(400).send("error-postback: no_amount");

    // Catat completion + update saldo user (tanpa tabel/view ledger)
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO task_completions (user_id, task_id, amount)
        VALUES (${user_id}, ${task_id}, ${credit}::numeric)
      `;
      await tx`
        UPDATE users
        SET balance = balance + ${credit}::numeric
        WHERE id = ${user_id}
      `;
    });

    return res.status(200).send("ok");
  } catch (e) {
    console.error("postback error:", e);
    return res.status(500).send("error-postback");
  }
};
