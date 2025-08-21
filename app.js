/* Watch2EarnReall — app.js (LOCK task = $0.01, check-in progresif 0.02x)
   Fokus perbaikan:
   - Check-in tetap progresif: Day1=0.02, Day2=0.04, ...
   - Task (watch ads) DIKUNCI $0.01 di client: label, request, dan toast
   - Balance tetap ikut server kalau dikirim; tampilan (+$) di-toast dibatasi $0.01
   - Tombol Claim check-in auto nonaktif & hilang setelah klaim
*/
(() => {
  // ===== Telegram & API =====
  const tg = window.Telegram?.WebApp;
  tg?.ready?.(); try { tg?.expand?.(); } catch {}
  const API = ""; // optional base path

  // ===== STATE =====
  const state = {
    user: null,
    balance: 0,
    streak: 0,
    lastCheckin: null, // YYYY-MM-DD
    tgUser: null,
  };

  // ===== KONFIG =====
  // Check-in 9 hari: progresif 0.02 * hari
  const CHECKIN_DAYS = 9;
  const CHECKIN_REWARDS = Array.from({ length: CHECKIN_DAYS }, (_, i) =>
    Number(((i + 1) * 0.02).toFixed(2))
  );

  // Task reward fixed 0.01
  const TASK_REWARD = 0.01;

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

    // HOME → Check-in
    checkinTiles:       document.getElementById("checkinTiles"),
    checkinProgressBar: document.getElementById("checkinProgressBar"),
    btnClaim:           document.getElementById("btnClaim"),

    // TASKS: label reward di UI (tambah data-reward-label di HTML kalau belum)
    taskRewardLabels:   document.querySelectorAll("[data-reward-label]"),

    profileName: document.getElementById("profileName"),
  };

  // ===== HELPERS =====
  function money(n) { return `$${Number(n).toFixed(2)}`; }
  function setBalance(n) { state.balance = Number(n || 0); if (els.balance) els.balance.textContent = money(state.balance); }

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

  // Persist fallback
  function saveCheckin() {
    try { localStorage.setItem("lastCheckin", state.lastCheckin || ""); localStorage.setItem("streak", String(state.streak||0)); } catch {}
  }
  function loadPersisted() {
    try {
      const l = localStorage.getItem("lastCheckin");
      const s = parseInt(localStorage.getItem("streak") || "0", 10);
      if (l) state.lastCheckin = l;
      if (!isNaN(s)) state.streak = s;
    } catch {}
  }

  // Fetch wrapper kirim auth Telegram / dummy dev
  async function safeFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const tgRaw = window.Telegram?.WebApp?.initData || "";
    if (tgRaw) {
      headers["x-telegram-init-data"] = tgRaw;
    } else {
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

  // ===== Top Toast =====
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
  function toast(message) {
    injectToastStyles(); updateSafeTop();
    let el = document.getElementById("topToast");
    if (!el) { el = document.createElement("div"); el.id = "topToast"; el.innerHTML = `<span class="ticon">✔</span><span class="tmsg"></span>`; document.body.appendChild(el); }
    el.querySelector(".tmsg").textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  // ===== CHECK-IN =====
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
      els.checkinProgressBar.style.width = ((state.streak / CHECKIN_DAYS) * 100) + "%";
    }

    if (els.btnClaim) {
      const allowed = canClaimToday();
      els.btnClaim.disabled = !allowed;
      els.btnClaim.style.opacity = allowed ? "1" : ".65";
      els.btnClaim.style.pointerEvents = allowed ? "auto" : "none";
      els.btnClaim.style.display = allowed ? "" : "none";
      const span = els.btnClaim.querySelector("#claimText");
      if (span) span.textContent = allowed ? "Claim Bonus" : "Already checked-in";
    }
  }
  async function onClickClaimCheckin() {
    if (!canClaimToday()) { toast("Already checked-in."); return; }
    try {
      // Gate iklan (opsional)
      try { const fn = window[window.MONETAG_FN]; if (typeof fn === "function") fn(); } catch {}
      await claimToday();
    } catch { toast("Failed to reach server."); }
  }
  async function claimToday() {
    try {
      const data = await safeFetch(`/api/checkin/claim`, { method: "POST", body: JSON.stringify({}) });
      if (data?.ok) {
        state.streak = typeof data.streak === "number" ? data.streak : Math.min(state.streak + 1, CHECKIN_DAYS);
        state.lastCheckin = todayStr();
        saveCheckin();
        if (typeof data.balance === "number") setBalance(data.balance);
        const amt = (data && data.amount != null) ? Number(data.amount) : CHECKIN_REWARDS[Math.max(0, state.streak-1)];
        renderCheckinTiles();
        toast(`Check-in successful! +$${amt.toFixed(2)}`);
      } else {
        toast(data?.error || "Check-in failed.");
      }
    } catch { toast("Failed to reach server."); }
  }

  // ===== TASKS (WATCH ADS) — reward fixed $0.01 =====
  function paintTaskRewardLabels() {
    if (!els.taskRewardLabels) return;
    els.taskRewardLabels.forEach(el => { el.textContent = money(TASK_REWARD); });
  }

  function initTasks() {
    paintTaskRewardLabels();

    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn => {
      if (btn.__bound) return; btn.__bound = true;

      btn.addEventListener("click", async () => {
        try {
          const card = btn.closest(".task-card");
          const taskId = card?.dataset?.taskId;
          if (!taskId) return;

          // Tampilkan iklan (kalau ada)
          try { const fn = window[window.MONETAG_FN]; if (typeof fn === "function") fn(); } catch {}

          // 1) Start session — MINTA reward 0.01
          const start = await safeFetch(`/api/task/create`, {
            method: "POST",
            body: JSON.stringify({ task_id: taskId, reward: TASK_REWARD })
          });
          if (!start?.ok || !start.token) return toast(start?.error || "Gagal mulai task.");

          const token = start.token;
          const waitSec = Number(start.wait_seconds || 16);

          // 2) Tunggu X detik (simulasi nonton)
          await new Promise(r => setTimeout(r, waitSec * 1000));

          // 3) Complete + credit
          async function tryComplete() {
            const data = await safeFetch(`/api/reward/complete`, {
              method: "POST",
              body: JSON.stringify({ task_id: taskId, token, reward: TASK_REWARD })
            });

            if (data?.credited) {
              btn.disabled = true;

              // Tampilan (+$) dibatasi max 0.01
              const credited = (typeof data.amount === "number")
                ? Math.min(Number(data.amount), TASK_REWARD)
                : TASK_REWARD;

              // Update balance: pakai angka server kalau ada; kalau tidak, tambah lokal
              if (typeof data.balance === "number") {
                setBalance(data.balance);
              } else {
                setBalance(state.balance + credited);
              }

              toast(`+$${credited.toFixed(2)}`);
              return;
            }

            if (data?.awaiting && data.wait_seconds > 0) {
              await new Promise(r => setTimeout(r, Number(data.wait_seconds) * 1000));
              return tryComplete();
            }
            toast(data?.error || "Verification failed.");
          }

          await tryComplete();
        } catch { toast("Failed to reach server."); }
      });
    });
  }

  // ===== USER SYNC =====
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
    } catch {}
  }

  // ===== NAV + PROFILE =====
  function setScreen(name) {
    Object.entries(els.screens).forEach(([k, el]) => el?.classList.toggle("active", k === name));
    els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.target === name));
  }
  function initTabs() { els.tabs.forEach(tab => tab.addEventListener("click", () => setScreen(tab.dataset.target))); }
  function setProfile() {
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      state.tgUser = u || null;
      if (els.profileName) els.profileName.textContent = u?.username ? `@${u.username}` : (u?.first_name || "Guest");
    } catch {}
  }

  // ===== INIT =====
  function init() {
    ensureUser();
    loadPersisted();
    setProfile();
    setBalance(state.balance);
    injectToastStyles(); updateSafeTop();
    window.addEventListener("resize", updateSafeTop);
    window.Telegram?.WebApp?.onEvent?.("viewportChanged", updateSafeTop);

    renderCheckinTiles();
    els.btnClaim?.addEventListener("click", onClickClaimCheckin);

    initTabs();
    initTasks();
    syncUser();

    document.body.dataset.tg = tg?.colorScheme || "light";
  }
  init();
})();
