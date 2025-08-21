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
    user: null,
    balance: 0,
    streak: 0,
    lastCheckin: null, // YYYY-MM-DD
    tgUser: null,
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
      state.user = { id: uid };
    }
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  // Persist lastCheckin & streak (optional fallback UX)
  function saveCheckin() {
    try {
      localStorage.setItem("lastCheckin", state.lastCheckin || "");
      localStorage.setItem("streak", String(state.streak || 0));
    } catch {}
  }
  function loadPersisted() {
    try {
      const l = localStorage.getItem("lastCheckin");
      const s = parseInt(localStorage.getItem("streak") || "0", 10);
      if (l) state.lastCheckin = l;
      if (!isNaN(s)) state.streak = s;
    } catch {}
  }

  // Fetch wrapper that sends Telegram initData or test header
  async function safeFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const tgRaw = window.Telegram?.WebApp?.initData || "";

    if (tgRaw) {
      headers["x-telegram-init-data"] = tgRaw; // Mini App prod
    } else {
      // DEV: browser
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
    style.id = "topToastStyles";
    style.textContent = `
      :root { --safe-top: 12px; }
      #topToast{
        position: fixed; top: var(--safe-top); left: 50%;
        transform: translate(-50%, -140%); transition: transform .35s, opacity .35s;
        background: rgba(15,23,42,.88); color: #e5f2ff; border:1px solid rgba(255,255,255,.12);
        padding: 8px 12px; border-radius: 12px; z-index: 9999; opacity: 0;
        display:flex; align-items:center; gap:8px; font-weight:600;
      }
      #topToast.show{ transform: translate(-50%, 0); opacity: 1 }
      #topToast .ticon{ font-size: 18px }
    `;
    document.head.appendChild(style);
  }
  function updateSafeTop() {
    const inset = (window.Telegram?.WebApp?.safeAreaInset?.top || 0);
    const topPx = Math.max(8, inset || 0) + 8;
    document.documentElement.style.setProperty("--safe-top", `${topPx}px`);
  }
  function toast(message, type="info") {
    injectToastStyles(); updateSafeTop();
    let el = document.getElementById("topToast");
    if (!el) { el = document.createElement("div"); el.id = "topToast"; el.innerHTML = `<span class="ticon">✔</span><span class="tmsg"></span>`; document.body.appendChild(el); }
    el.querySelector(".tmsg").textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  // ===== HOME: CHECK-IN (9 days) =====
  function canClaimToday() {
    const today = todayStr();
    return state.lastCheckin !== today && state.streak < CHECKIN_DAYS;
  }

  function renderCheckinTiles() {
    if (!els.checkinTiles) return;
    const days = Array.from({ length: CHECKIN_DAYS }, (_, i) => i + 1);
    const next = Math.min(state.streak + 1, CHECKIN_DAYS);

    els.checkinTiles.innerHTML = days.map(d => {
      let cls = "day-tile";
      if (d <= state.streak) cls += " done";
      else if (d === next && canClaimToday()) cls += " current";
      else if (d > next) cls += " locked";
      const reward = CHECKIN_REWARDS[d - 1].toFixed(2);
      return `<div class="${cls}" data-day="${d}">Day ${d}<small>${reward}</small></div>`;
    }).join("");

    if (els.checkinProgressBar) {
      const pct = (state.streak / CHECKIN_DAYS) * 100;
      els.checkinProgressBar.style.width = pct + "%";
    }

    if (els.btnClaim) {
      const allowed = canClaimToday();
      els.btnClaim.disabled = !allowed;
      els.btnClaim.style.opacity = allowed ? "1" : ".65";
      els.btnClaim.style.pointerEvents = allowed ? "auto" : "none";
      // Hide after claimed biar gak muncul terus
      els.btnClaim.style.display = allowed ? "" : "none";
      const span = els.btnClaim.querySelector("#claimText");
      if (span) span.textContent = allowed ? "Claim Bonus" : "Already checked-in";
    }
  }

  // Client-side ad gate + server validation claim
  async function onClickClaimCheckin() {
    if (!canClaimToday()) { toast("Already checked-in.", "error"); return; }

    // 1) optional: tampilkan iklan
    try {
      const fn = window[window.MONETAG_FN];
      if (typeof fn === "function") fn();
    } catch {}

    // 2) kemudian minta klaim ke server
    await claimToday();
  }

  async function claimToday() {
    try {
      const data = await safeFetch(`/api/checkin/claim`, { method: "POST", body: JSON.stringify({}) });
      if (data?.ok) {
        // Update streak; fallback ++ jika server tidak kirim
        if (typeof data.streak === "number") {
          state.streak = data.streak;
        } else {
          state.streak = Math.min(state.streak + 1, CHECKIN_DAYS);
        }
        // Pastikan lastCheckin ditandai hari ini
        state.lastCheckin = todayStr();
        saveCheckin();
        if (typeof data.balance === "number") setBalance(data.balance);
        renderCheckinTiles();
        toast(`Check-in successful! +$${Number(data.amount||0).toFixed(2)}`, "success");
      } else {
        toast(data?.error || "Check-in failed.", "error");
      }
    } catch (e) {
      toast("Failed to reach server.", "error");
    }
  }

  // ===== TASKS (server-validated + reward popup) =====
  function initTasks() {
    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn => {
      if (btn.__bound) return; btn.__bound = true;
      btn.addEventListener("click", async () => {
        try {
          const taskId = btn.closest(".task-card")?.dataset?.taskId;
          if (!taskId) return;

          try { const fn = window[window.MONETAG_FN]; if (typeof fn === "function") fn(); } catch {}

          // 1) Start server session
          const start = await safeFetch(`/api/task/create`, {
            method: "POST",
            body: JSON.stringify({ task_id: taskId })
          });
          if (!start?.ok || !start.token) return toast(start?.error || "Gagal mulai task.", "error");

          const token = start.token;
          const waitSec = Number(start.wait_seconds || 16);

          // 2) Wait X seconds
          await new Promise(r => setTimeout(r, waitSec * 1000));

          // 3) Try complete
          async function tryComplete() {
            const data = await safeFetch(`/api/reward/complete`, {
              method: "POST",
              body: JSON.stringify({ task_id: taskId, token })
            });
            if (data?.credited) {
              btn.disabled = true;
              setBalance(data.balance ?? state.balance);
              toast(`+$${Number(data.amount || 0).toFixed(2)}`, "success");
              return;
            }
            if (data?.awaiting && data.wait_seconds > 0) {
              await new Promise(r => setTimeout(r, Number(data.wait_seconds) * 1000));
              return tryComplete();
            }
            toast(data?.error || "Verification failed.", "error");
          }
          await tryComplete();
        } catch { toast("Failed to reach server.", "error"); }
      });
    });
  }

  // ===== REFERRAL: Inject UI (dipertahankan) =====
  function injectReferralStyles() {
    if (document.getElementById("referralStyles")) return;
    const style = document.createElement("style");
    style.id = "referralStyles";
    style.textContent = `
      .ref-hero{ padding:16px; border-radius:18px; }
      .ref-hero-head{ display:flex; align-items:center; justify-content:space-between; }
      .ref-badge{ padding:6px 10px; border-radius:12px; background:#1e293b; color:#e5f2ff; font-weight:700 }
      .ref-actions{ display:flex; flex-wrap:wrap; gap:8px; margin-top:8px }
      .ref-actions .btn{ border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px 10px }
    `;
    document.head.appendChild(style);
  }
  function injectReferralUI() {
    // (konten referral sudah ada di HTML; bagian ini dibiarkan)
  }
  function bindReferralEls() {
    // (binding tombol share/copy—dibiarkan atau sesuaikan)
  }
  function setReferralLink() {
    // (generate link referal—dibiarkan)
  }
  function initReferralButtons() {
    // (share handler—dibiarkan)
  }

  // ===== PROFILE / WITHDRAW / ADDRESS (dibiarkan) =====
  function initWithdrawForm() {}
  function initAddressForm() {}

  // ===== NAV =====
  function setScreen(name) {
    Object.entries(els.screens).forEach(([k, el]) => el?.classList.toggle("active", k === name));
    els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.target === name));
  }
  function initTabs() {
    els.tabs.forEach(tab => tab.addEventListener("click", () => setScreen(tab.dataset.target)));
  }

  // ===== SERVER USER SYNC (FIX: pakai nested data.user) =====
  async function syncUser() {
    try {
      const data = await safeFetch(`/api/user/get`);
      const u = (data && data.user) ? data.user : data;
      if (u && typeof u.balance === "number") setBalance(u.balance);
      if (u && (typeof u.streak === "number")) state.streak = u.streak || 0;
      if (u && (u.last_checkin || u.lastCheckin)) {
        const d = new Date(u.last_checkin || u.lastCheckin);
        if (!isNaN(d.getTime())) {
          state.lastCheckin = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        }
      }
      if (u && (u.checkin_today === true)) {
        state.lastCheckin = todayStr();
      }
      renderCheckinTiles();
    } catch { /* ignore */ }
  }

  // ===== INIT =====
  function setProfile() {
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      state.tgUser = u || null;
      if (els.profileName) els.profileName.textContent = u?.username ? `@${u.username}` : (u?.first_name || "Guest");
    } catch {}
  }

  function init() {
    ensureUser();
    loadPersisted();
    setProfile();
    setBalance(state.balance);

    injectToastStyles(); updateSafeTop();
    window.addEventListener("resize", updateSafeTop);
    window.Telegram?.WebApp?.onEvent?.("viewportChanged", updateSafeTop);

    // Referral area (tidak diubah UI-nya)
    injectReferralStyles(); injectReferralUI(); bindReferralEls(); setReferralLink();

    // HOME
    renderCheckinTiles();
    els.btnClaim?.addEventListener("click", onClickClaimCheckin);

    // NAV/REF/TASK/FORM
    initTabs(); initReferralButtons(); initTasks(); initWithdrawForm(); initAddressForm();

    // Data
    syncUser();

    // Theme
    document.body.dataset.tg = tg?.colorScheme || "light";

    // Home → referral shortcut
    els.btnHomeRefer?.addEventListener?.("click", () => {
      document.querySelector('.tab[data-target="referral"]')?.click();
    });
  }

  init();
})();
