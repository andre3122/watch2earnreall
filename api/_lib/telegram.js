// api/_lib/telegram.js — validator Telegram initData (resmi)
const crypto = require("crypto");

function parseInitData(raw) {
  const params = new URLSearchParams(raw || "");
  const data = {};
  for (const [k, v] of params.entries()) data[k] = v;

  const user = data.user ? JSON.parse(data.user) : null;
  const hash = data.hash || "";
  const auth_date = Number(data.auth_date || 0);

  // payload: semua key selain hash, sort asc, join "\n"
  delete data.hash;
  const payload = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join("\n");
  return { user, hash, auth_date, payload };
}

function validateInitData(raw, botToken, maxAgeSec = 24 * 3600) {
  try {
    const { user, hash, auth_date, payload } = parseInitData(raw);
    if (!hash || !botToken) return { ok:false, error:"missing" };
    const secret = crypto.createHash("sha256").update(botToken).digest();
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (expected !== (hash || "").toLowerCase()) return { ok:false, error:"bad-hash" };
    if (maxAgeSec && auth_date && (Date.now()/1000 - auth_date) > maxAgeSec) return { ok:false, error:"expired" };
    return { ok:true, data:{ user, auth_date } };
  } catch (e) {
    return { ok:false, error:"exception:"+ (e?.message||e) };
  }
}

module.exports = { parseInitData, validateInitData };
