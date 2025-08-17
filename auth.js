const { validateInitData } = require("./telegram");
const { getUserOrCreate } = require("./db");

async function authFromHeader(req) {
  try {
    const raw = req.headers["x-telegram-init-data"] || "";
    const botToken = process.env.BOT_TOKEN;

    // Dev/testing fallback: allow x-telegram-test-user JSON string
    if (!raw) {
      const test = req.headers["x-telegram-test-user"];
      if (test) {
        let tgUser;
        try { tgUser = JSON.parse(test); } catch {}
        if (!tgUser?.id) return { ok:false, status:401, error:"BAD_TEST_HEADER" };
        const user = await getUserOrCreate(tgUser);
        return { ok:true, user, tgUser, test:true };
      }
      return { ok:false, status:401, error:"NO_INITDATA" };
    }

    if (!botToken) return { ok:false, status:500, error:"NO_BOT_TOKEN" };

    const v = validateInitData(raw, botToken, 24*3600);
    if (!v.ok) return { ok:false, status:401, error:v.error || "BAD_INITDATA" };

    const tgUser = v.data.user;
    const user = await getUserOrCreate(tgUser);
    return { ok:true, user, tgUser };
  } catch (e) {
    console.error("authFromHeader crash:", e);
    return { ok:false, status:500, error:"AUTH_CRASH" };
  }
}

module.exports = { authFromHeader };