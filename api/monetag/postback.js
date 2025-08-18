// api/monetag/postback.js — handle Monetag postback (idempotent, robust)
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    // Monetag kirim token di query param; default 'subid' (bisa diubah lewat ENV)
    const param = process.env.MONETAG_TOKEN_PARAM || "subid";
    const token = (req.query?.[param] || "").toString().trim();

    if (!token) {
      return res.status(400).send("missing-token");
    }

    // Banyak jaringan pakai reward_event_type=valued; kalau bukan 'valued' kita abaikan saja
    const rewardFlag = String(req.query?.reward || "").toLowerCase();
    if (rewardFlag && rewardFlag !== "valued") {
      // bukan event bernilai (view start, dsb) → abaikan
      return res.status(200).send("ignored");
    }

    // Cari session berdasar token
    const { rows } = await sql`
      SELECT id, user_id, reward, status
      FROM ad_sessions
      WHERE token = ${token}
      LIMIT 1
    `;
    if (rows.length === 0) {
      // tidak ketemu → kemungkinan token salah / belum di-create
      return res.status(404).send("unknown-session");
    }

    const s = rows[0];

    // Idempotent: sudah di-credit? balas ok
    if (s.status === "credited") {
      return res.status(200).send("ok");
    }

    // Credit saldo + catat ledger (transaksi atomic cukup aman di serverless)
    await sql`
      INSERT INTO ledger (user_id, amount, reason, ref_id)
      VALUES (${s.user_id}, ${s.reward}, 'ad_complete', ${token})
    `;
    await sql`
      UPDATE users
      SET balance = balance + ${s.reward}::numeric, updated_at = now()
      WHERE id = ${s.user_id}
    `;
    await sql`
      UPDATE ad_sessions
      SET status = 'credited', completed_at = now()
      WHERE id = ${s.id}
    `;

    return res.status(200).send("ok");
  } catch (err) {
    console.error("postback error:", err);
    // beri pesan jelas biar gampang debug daripada cuma "error"
    return res.status(500).send("error-postback");
  }
};
