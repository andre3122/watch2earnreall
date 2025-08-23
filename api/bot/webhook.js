// api/bot/webhook.js — kirim tombol "Open Mini App" saat /start
const TOKEN = process.env.BOT_TOKEN; // harus bot yang sama dengan yang dipakai buka WebApp
const SECRET = process.env.SETUP_SECRET || ""; // pakai secret yang sama dengan migrate
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || ""; // opsional, contoh: https://watch2earnreall.vercel.app

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return r.json();
}

function baseUrlFromReq(req) {
  if (PUBLIC_BASE) return PUBLIC_BASE.replace(/\/+$/,"");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  // -------- helper: proteksi opsi GET (set/delete webhook) pakai secret --------
  if (req.method === "GET") {
    const u = new URL(req.url, "http://x");
    const key = u.searchParams.get("key") || "";
    if (!SECRET || key !== SECRET) return res.status(404).json({ ok:false, error:"Not Found" });

    if (u.searchParams.get("set") === "1") {
      const url = `${baseUrlFromReq(req)}/api/bot/webhook`;
      const out = await tg("setWebhook", { url });
      return res.json({ ok:true, set:true, result: out });
    }
    if (u.searchParams.get("delete") === "1") {
      const out = await tg("deleteWebhook", { drop_pending_updates: false });
      return res.json({ ok:true, deleted:true, result: out });
    }
    return res.json({ ok:true, hint:"?set=1&key=SECRET atau ?delete=1&key=SECRET" });
  }

  // -------- handle update POST dari Telegram --------
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const msg = update.message || update.edited_message;

    if (msg && msg.text && String(msg.text).startsWith("/start")) {
      const chat_id = msg.chat.id;
      const webUrl  = `${baseUrlFromReq(req)}/`;

      await tg("sendMessage", {
        chat_id,
        text: "Welcome To Watch2earnreall_bot || Open Mini App To Start Earn Real Money By Watching Ads And Completing Task You Can Widraw Instantly At Any Time .",
        reply_markup: {
          inline_keyboard: [[
            { text: "Open Mini App ▶️", web_app: { url: webUrl } }
          ]]
        }
      });
    }

    return res.json({ ok:true });
  } catch (e) {
    console.error("webhook error:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
