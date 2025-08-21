/* Watch2EarnReall — app.js (EN, server-validated)
   - Daily Check-in: 9 days (0.02 → 0.18), server validates & credits
   - Tasks: server validate & credit + fancy reward popup
   - Referral: "Refer & Earn Forever" (3 steps, Copy / TG / WA / Twitter/X, list + search)
   - Top Toast: slim bar at top (Copy/Withdraw/Error/Info)
   - Sends Telegram initData → server via header for auth
*/
(() => {
  // ===== Telegram & API =====
  const tg = window.Telegram?.WebApp;
  tg?.ready?.(); try { tg?.expand?.(); } catch {}
  const INIT = tg?.initData || ""; // sent to server in header
  const API = ""; // optional base path

  // ===== STATE =====
  const state = {
    user: tg?.initDataUnsafe?.user || null,
    balance: 0.00,
    streak: 0,
    lastCheckin: null,
    address: localStorage.getItem("bsc_address") || "",
    tasks: {
      ad1: { completed: false, reward: 0.01 },
      ad2: { completed: false, reward: 0.01 }
    }
  };

  // ===== Check-in config (9 days, +0.02 per day) =====
  const CHECKIN_DAYS = 9;
  const CHECKIN_REWARDS = Array.from({ length: CHECKIN_DAYS }, (_, i) =>
    Number(((i + 1) * 0.02).toFixed(2))
  );
  let checkinSession = { token: null, done: false }; // reserved (client-side gate)

  // ===== ELEM =====
  const els = {
    screens: {
      home:      document.getElementById("screen-home"),
      task:      document.getElementById("screen-task"),
      referral:  document.getElementById("screen-referral"),
      profile:   document.getElementById("screen-profile"),
    },
    tabs: document.querySelectorAll(".tabbar .tab"),
    balance: document.getElementById("balance"),

    // HOME
    checkinTiles:       document.getElementById("checkinTiles"),
    checkinProgressBar: document.getElementById("checkinProgressBar"),
    btnClaim:           document.getElementById("btnClaim"),
    btnHomeRefer:       document.getElementById("btnHomeRefer"),

    // REFERRAL (bound after inject)
    refLink: null, btnCopyRef: null,
    btnShareTG: null, btnShareWA: null, btnShareTW: null,
    refCount: null, refList: null, refSearch: null,

    // PROFILE / WITHDRAW / ADDRESS
    profileAvatar:   document.getElementById("profileAvatar"),
    profileName:     document.getElementById("profileName"),
    profileUsername: document.getElementById("profileUsername"),
    withdrawForm:    document.getElementById("withdrawForm"),
    withdrawAmount:  document.getElementById("withdrawAmount"),
    addressForm:     document.getElementById("addressForm"),
    bscAddress:      document.getElementById("bscAddress"),
  };

  // ===== HELPERS =====
  function money(n) { return `$${Number(n).toFixed(2)}`; }
  function setBalance(n) { state.balance = Number(n); if (els.balance) els.balance.textContent = money(state.balance); }

  // Browser fallback user (safe for local tests)
  function ensureUser() {
    if (!state.user || !state.user.id) {
      const saved = localStorage.getItem("demo_uid");
      const uid = saved || String(Math.floor(100000 + Math.random() * 900000));
      if (!saved) localStorage.setItem("demo_uid", uid);
      state.user = { id: uid, first_name: "Guest", username: "guest" };
    }
  }

  // STRICT: send Telegram initData so server can validate auth
  async function safeFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const tgRaw = window.Telegram?.WebApp?.initData || "";

  if (tgRaw) {
    // mode Mini App (production) – kirim initData ke server
    headers["x-telegram-init-data"] = tgRaw;
  } else {
    // mode DEV (browser biasa) – kirim user dummy agar server menerima
    let uid = localStorage.getItem("demo_uid");
    if (!uid) { uid = String(Math.floor(Math.random()*9e9)+1e9); localStorage.setItem("demo_uid", uid); }
    headers["x-telegram-test-user"] = JSON.stringify({ id: uid, first_name: "Guest", username: "guest" });
  }

  const res = await fetch(path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  return data || {};
}

  // ===== Top Toast (safe-area aware) =====
  let toastTimer = null;
  function injectToastStyles() {
    if (document.getElementById("topToastStyles")) return;
    const style = document.createElement("style");
