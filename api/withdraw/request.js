const { q } = require('../_lib/db');
const { authFromHeader } = require('../_lib/auth');

function validAddr(a){
  // 0x + 40 hex ATAU "binance id" alfanumerik minimal 6
  return /^(0x[0-9a-fA-F]{40}|[A-Za-z0-9._-]{6,})$/.test(a || '');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });

  const { ok, user, status } = await authFromHeader(req);
  if (!ok) return res.status(status || 401).json({ ok:false, error:'AUTH_FAILED' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const amount  = Number(body.amount);
  const address = (body.address || '').trim();

  if (!amount || amount < 1)  return res.status(400).json({ ok:false, error:'BAD_AMOUNT' });
  if (!validAddr(address))     return res.status(400).json({ ok:false, error:'BAD_ADDRESS' });

  await q('BEGIN');
  try {
    // Simpan/overwrite address user (opsional)
    await q(
      `UPDATE users SET address=$1, updated_at=now() WHERE id=$2`,
      [address, user.id]
    );

    // (Opsional) potong saldo saat request; hapus blok ini jika mau potong saat approve
    const up = await q(
      `UPDATE users SET balance = balance - $1, updated_at=now()
       WHERE id=$2 AND balance >= $1
       RETURNING balance`,
      [amount, user.id]
    );
    if (!up.length) { await q('ROLLBACK'); return res.status(400).json({ ok:false, error:'INSUFFICIENT_BALANCE' }); }

    // Simpan request ke salah satu tabel yg kamu punya
    let inserted = false;
    try {
      await q(
        `INSERT INTO withdraw_requests (user_id, amount, address, status, created_at)
         VALUES ($1,$2,$3,'pending', now())`,
        [user.id, amount, address]
      );
      inserted = true;
    } catch (_) {}
    if (!inserted) {
      await q(
        `INSERT INTO withdrawals (user_id, amount, address, status, created_at)
         VALUES ($1,$2,$3,'pending', now())`,
        [user.id, amount, address]
      );
    }

    await q('COMMIT');
    return res.json({ ok:true, balance: up[0].balance });
  } catch (e) {
    await q('ROLLBACK');
    console.error('withdraw/request crash:', e);
    return res.status(200).json({ ok:false, error:String(e?.message || e) });
  }
};
