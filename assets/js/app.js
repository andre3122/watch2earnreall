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
    const tgRaw = window.Telegram?.WebApp?.initData || "";
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (tgRaw) headers["x-telegram-init-data"] = tgRaw;

    const res = await fetch(API + path, { ...options, headers });
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
        background: linear-gradient(90deg,#1f1b2e,#37345a); color:#fff; font-weight:800; font-size:13px;
        padding:10px 14px; border-radius:999px; box-shadow:0 10px 28px rgba(0,0,0,.3);
        z-index: 2147483647; pointer-events:none; opacity:0; display:flex; align-items:center; gap:8px;
      }
      #topToast.show{ transform: translate(-50%, 0); opacity:1; }
      #topToast.success{ background: linear-gradient(90deg,#00c853,#00e676); color:#062d1a; }
      #topToast.error{ background: linear-gradient(90deg,#ff3d57,#ff6f6f); }
      #topToast .ticon{ font-size:16px; line-height:1; }
    `;
    document.head.appendChild(style);
  }
  function updateSafeTop() {
    const inset = (window.Telegram?.WebApp?.safeAreaInset?.top || 0);
    const topPx = Math.max(8, inset || 0) + 8;
    document.documentElement.style.setProperty("--safe-top", `${topPx}px`);
  }
  function ensureToastEl() {
    injectToastStyles(); updateSafeTop();
    let el = document.getElementById("topToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "topToast";
      el.innerHTML = `<span class="ticon">✔</span><span class="tmsg"></span>`;
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(message, type="success") {
    const el = ensureToastEl();
    el.classList.remove("success","error");
    el.classList.add(type);
    el.querySelector(".ticon").textContent = type === "error" ? "⚠️" : "✔";
    el.querySelector(".tmsg").textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }
  window.__toast = toast;

  // ===== Reward Popup (for tasks) =====
  function injectRewardPopupStyles() {
    if (document.getElementById("rewardPopupStyles")) return;
    const style = document.createElement("style");
    style.id = "rewardPopupStyles";
    style.textContent = `
      #rewardPop{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(10,12,20,.38);
        backdrop-filter: blur(6px); opacity:0; pointer-events:none; transition:opacity .25s; z-index:2147483600; }
      #rewardPop.show{ opacity:1; pointer-events:auto; }
      .rp-card{ width:86%; max-width:380px; background: radial-gradient(120% 140% at 50% 0%, #a44ff4 0%, #c86bfa 40%, #ff7eb3 100%);
        color:#fff; border-radius:22px; padding:18px; border:1px solid rgba(255,255,255,.35); box-shadow:0 24px 64px rgba(164,79,244,.45);
        transform:scale(.9); transition: transform .25s; position:relative; overflow:hidden; }
      #rewardPop.show .rp-card{ transform:scale(1); }
      .rp-sheen{ position:absolute; inset:-40% -20% auto -20%; height:140%;
        background: linear-gradient(120deg, transparent, rgba(255,255,255,.25), transparent);
        transform: rotate(12deg); animation: sheen 2s linear infinite; }
      @keyframes sheen { from{ left:-60% } to{ left:120% } }
      .rp-coin{ width:64px; height:64px; border-radius:50%; display:grid; place-items:center; background: radial-gradient(100% 100% at 50% 30%, #fff59d, #ffc107);
        color:#7a4b00; font-size:28px; font-weight:900; box-shadow:0 10px 24px rgba(0,0,0,.25), inset 0 2px 8px rgba(255,255,255,.6); margin:6px auto 10px; }
      .rp-amt{ text-align:center; font-size:28px; font-weight:1000; letter-spacing:.3px; background: linear-gradient(90deg,#ffffff,#ffe082,#ffca28,#ffa000);
        -webkit-background-clip:text; -webkit-text-fill-color: transparent; }
      .rp-msg{ text-align:center; margin-top:4px; opacity:.95; font-weight:700; }
      .rp-actions{ display:flex; justify-content:center; margin-top:12px; }
      .rp-ok{ border:none; color:#6a32c9; background:#fff; font-weight:900; padding:10px 16px; border-radius:14px; min-width:120px;
        box-shadow: 0 8px 20px rgba(255,255,255,.28); }
    `;
    document.head.appendChild(style);
  }
  function showRewardPopup(amount=0.00, message="Reward added!") {
    injectRewardPopupStyles();
    const old = document.getElementById("rewardPop"); if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "rewardPop";
    const amt = `$${Number(amount).toFixed(2)}`;
    wrap.innerHTML = `
      <div class="rp-card">
        <div class="rp-sheen"></div>
        <div class="rp-coin">★</div>
        <div class="rp-amt">+${amt}</div>
        <div class="rp-msg">${message}</div>
        <div class="rp-actions"><button class="rp-ok">OK</button></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.classList.remove("show"); setTimeout(()=>wrap.remove(), 220); };
    wrap.querySelector(".rp-ok").addEventListener("click", close);
    wrap.addEventListener("click", (e)=>{ if(e.target.id==="rewardPop") close(); });
    requestAnimationFrame(()=> wrap.classList.add("show"));
    setTimeout(close, 1800);
  }

  // ===== PERSIST / DATE =====
  function loadPersisted() {
    const s = localStorage.getItem("checkin_state");
    if (s) {
      try { const j = JSON.parse(s); state.streak = j.streak || 0; state.lastCheckin = j.lastCheckin || null; } catch {}
    }
    if (state.address) els.bscAddress && (els.bscAddress.value = state.address);
  }
  function saveCheckin() {
    localStorage.setItem("checkin_state", JSON.stringify({ streak: state.streak, lastCheckin: state.lastCheckin }));
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
      els.checkinProgressBar.style.width = `${pct}%`;
    }
    if (els.btnClaim) {
      els.btnClaim.disabled = !canClaimToday();
      const span = els.btnClaim.querySelector("#claimText");
      if (span) span.textContent = canClaimToday() ? "Claim Bonus" : "Already checked-in";
    }
  }

  // Client-side ad gate + server validation claim
  async function onClickClaimCheckin() {
    if (!canClaimToday()) { toast("Already checked-in.", "error"); return; }

    // 1) Try to show ad first (client-side gate)
    try {
      const fn = window[window.MONETAG_FN];
      if (typeof fn === "function") fn(); // show Monetag ad if integrated
    } catch {}

    // 2) Then request claim to server (server validates lastCheckin/streak)
    await claimToday();
  }

  async function claimToday() {
    try {
      const data = await safeFetch(`/api/checkin/claim`, { method: "POST", body: JSON.stringify({}) });
      if (data?.ok) {
        state.streak = data.streak ?? state.streak;
        state.lastCheckin = data.lastCheckin ?? state.lastCheckin;
        saveCheckin();
        setBalance(data.balance ?? state.balance);
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
      btn.addEventListener("click", async () => {
        const taskId = btn.closest(".task-card")?.dataset?.taskId;
        if (!taskId) return;
        if (state.tasks[taskId]?.completed) return;

        // Optional: trigger Monetag ad
        try { const fn = window[window.MONETAG_FN]; if (typeof fn === "function") fn(); } catch {}

        try {
          const data = await safeFetch(`/api/reward/complete`, {
            method: "POST",
            body: JSON.stringify({ task_id: taskId })
          });
          if (data?.credited) {
            const amt = typeof data.amount === "number" ? data.amount : (state.tasks[taskId].reward || 0);
            state.tasks[taskId].completed = true;
            setBalance(data.balance ?? (state.balance + amt));
            btn.disabled = true;
            showRewardPopup(amt, "Reward added!");
          } else {
            toast(data?.error || "Verification failed.", "error");
          }
        } catch (e) {
          toast("Failed to reach server.", "error");
        }
      });
    });
  }

  // ====== REFERRAL: Inject UI & Styles ======
  function injectReferralStyles() {
    if (document.getElementById("referralStyles")) return;
    const style = document.createElement("style");
    style.id = "referralStyles";
    style.textContent = `
      .ref-hero{ padding:16px; border-radius:18px; }
      .ref-hero-head{ display:flex; align-items:center; justify-content:space-between; }
      .ref-badge{ background:#eef2f7; border:1px solid var(--line); width:44px; height:28px; border-radius:999px; display:grid; place-items:center; font-weight:800; }
      .ref-steps{ list-style:none; margin:10px 0 12px; padding:0; display:grid; gap:10px; }
      .ref-steps li{ display:flex; gap:10px; align-items:flex-start; background:#fff; border:1px solid var(--line); border-radius:14px; padding:10px; }
      .ref-ico{ width:36px; height:36px; border-radius:12px; display:grid; place-items:center; background:linear-gradient(135deg,#dfe7ff,#eaf3ff); font-size:18px; }
      .ref-subtitle{ margin:10px 0 8px; }
      .ref-input-group{ display:flex; gap:10px; }
      .ref-input-group input{ flex:1 1 auto; height:44px; border:1px solid var(--line); border-radius:16px; padding:0 12px; background:#fff; font-weight:700; }
      .copy-pill{ height:44px; padding:0 16px; border-radius:16px; font-weight:900; }
      .ref-share-buttons{ margin-top:10px; display:flex; gap:10px; }
      .ref-share-buttons .brand{ color:#fff; border:none; height:40px; padding:0 14px; border-radius:12px; font-weight:800; }
      .ref-share-buttons .tg{ background:linear-gradient(90deg,#7a5cff,#4da3ff); }
      .ref-share-buttons .wa{ background:linear-gradient(90deg,#27ae60,#2ecc71); }
      .ref-share-buttons .tw{ background:linear-gradient(90deg,#1da1f2,#3bb3ff); color:#083a63; }
      .ref-list-card{ margin-top:14px; padding:14px; }
      .ref-list-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
      .ref-count-badge{ width:44px; height:44px; border-radius:999px; display:grid; place-items:center; background:#eef2f7; border:1px solid var(--line); color:#0b1220; font-weight:800; }
      .ref-search-row input{ width:100%; height:42px; border:1px solid var(--line); border-radius:12px; padding:0 12px; background:#fff; margin-bottom:8px; }
      .ref-empty{ color:var(--muted); }
      #refList .ref-item{ display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px dashed rgba(0,0,0,.06); }
      #refList .ref-item .avatar{ width:36px; height:36px; border-radius:50%; background:#eef2f7; }
    `;
    document.head.appendChild(style);
  }

  function injectReferralUI() {
    const box = els.screens.referral; if (!box) return;
    box.innerHTML = `
      <div class="ref-hero glass card">
        <div class="ref-hero-head">
          <h2>Refer & Earn Forever</h2>
          <div class="ref-badge">25%</div>
        </div>
        <p class="muted">Earn <strong>25%</strong> of your friends' earnings for life! Follow these simple steps:</p>
        <ul class="ref-steps">
          <li><div class="ref-ico">🔗</div><div><strong>1. Copy Your Link</strong><br><small>Grab your unique referral link below.</small></div></li>
          <li><div class="ref-ico">📣</div><div><strong>2. Share with Friends</strong><br><small>Use Telegram, WhatsApp, or Twitter/X buttons.</small></div></li>
          <li><div class="ref-ico">💰</div><div><strong>3. Earn Lifetime Rewards</strong><br><small>Get 25% of your friends' earnings forever!</small></div></li>
        </ul>
        <h3 class="ref-subtitle">Your Referral Link</h3>
        <div class="ref-input-group">
          <input id="refLink" readonly value="Generating…"/>
          <button id="btnCopyRef" class="btn copy-pill">Copy</button>
        </div>
        <div class="ref-share-buttons">
          <button id="btnShareTG" class="btn brand tg">Telegram</button>
          <button id="btnShareWA" class="btn brand wa">WhatsApp</button>
          <button id="btnShareTW" class="btn brand tw">Twitter/X</button>
        </div>
      </div>
      <div class="glass card ref-list-card">
        <div class="ref-list-head">
          <h3>Referrals</h3>
          <div class="ref-count-badge"><span id="refCount">0</span></div>
        </div>
        <div class="ref-search-row"><input id="refSearch" placeholder="Search referrals by username…"/></div>
        <div id="refList" class="ref-empty">Your referrals will appear here.</div>
      </div>`;
  }

  function bindReferralEls() {
    els.refLink   = document.getElementById("refLink");
    els.btnCopyRef= document.getElementById("btnCopyRef");
    els.btnShareTG= document.getElementById("btnShareTG");
    els.btnShareWA= document.getElementById("btnShareWA");
    els.btnShareTW= document.getElementById("btnShareTW");
    els.refCount  = document.getElementById("refCount");
    els.refList   = document.getElementById("refList");
    els.refSearch = document.getElementById("refSearch");
  }

  // ===== REFERRAL Logic =====
  function setReferralLink() {
    const id = state.user?.id || "guest";
    const link = `https://t.me/${window.BOT_USERNAME}?start=ref_${id}`;
    els.refLink && (els.refLink.value = link);
  }
  function copy(text) {
    try { navigator.clipboard.writeText(text); toast("Link copied!", "success"); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); toast("Link copied!", "success");
    }
  }
  function initReferralButtons() {
    els.btnCopyRef?.addEventListener("click", () => els.refLink && copy(els.refLink.value));
    const share = (platform) => {
      const url  = els.refLink?.value || `https://t.me/${window.BOT_USERNAME}?start=ref_${state.user?.id||"guest"}`;
      const text = "Join Watch2EarnReall and earn by watching ads!";
      if (navigator.share) { navigator.share({ title:"Watch2EarnReall", text, url }).catch(()=>{}); return; }
      const open = (u) => window.open(u, "_blank");
      if (platform === "tg") open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      if (platform === "wa") open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`);
      if (platform === "tw") open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
    };
    els.btnShareTG?.addEventListener("click", ()=>share("tg"));
    els.btnShareWA?.addEventListener("click", ()=>share("wa"));
    els.btnShareTW?.addEventListener("click", ()=>share("tw"));
    els.refSearch?.addEventListener("input", () => {
      const q = els.refSearch.value.toLowerCase();
      document.querySelectorAll("#refList .ref-item").forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  async function fetchReferrals() {
    try {
      const data = await safeFetch(`/api/referrals`);
      els.refCount && (els.refCount.textContent = data?.count ?? 0);
      const list = Array.isArray(data?.list) ? data.list : [];
      if (els.refList) {
        els.refList.classList.remove("ref-empty");
        els.refList.innerHTML = list.length
          ? list.map(r => (
              `<div class="ref-item"><div class="avatar"></div>
                 <div>${r?.name || "User"}<br><small>${r?.joined || ""}</small></div></div>`
            )).join("")
          : "Your referrals will appear here.";
      }
    } catch { /* silent */ }
  }

  // ===== PROFILE / WITHDRAW / ADDRESS =====
  function setProfile() {
    const u = state.user;
    const name = u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "Guest";
    const username = u?.username ? `@${u.username}` : (u ? `id:${u.id}` : "@guest");
    els.profileName && (els.profileName.textContent = name);
    els.profileUsername && (els.profileUsername.textContent = username);
    const photo = u?.photo_url;
    if (photo && els.profileAvatar) {
      const img = new Image(); img.src = photo; img.alt = "Avatar";
      els.profileAvatar.innerHTML = ""; els.profileAvatar.appendChild(img);
    } else if (els.profileAvatar) {
      const initials = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
      els.profileAvatar.innerHTML = `<div style="display:grid;place-items:center;width:100%;height:100%;color:#fff;font-weight:800;">${initials}</div>`;
    }
  }

  function initWithdrawForm() {
    els.withdrawForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(els.withdrawAmount.value);
      if (isNaN(amount) || amount < 1) return toast("Minimum withdraw is $1", "error");
      if (!state.address) return toast("Please fill your BEP20 address first.", "error");
      try {
        const data = await safeFetch(`/api/withdraw`, {
          method: "POST",
          body: JSON.stringify({ amount, address: state.address })
        });
        if (data?.ok) { toast("Withdrawal request submitted.", "success"); els.withdrawAmount.value = ""; }
        else { toast(data?.error || "Withdraw failed.", "error"); }
      } catch { toast("Failed to reach server.", "error"); }
    });
  }

  function initAddressForm() {
    els.addressForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = (els.bscAddress.value || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast("Invalid BEP20 address.", "error");
      state.address = addr; localStorage.setItem("bsc_address", addr);
      try {
        await safeFetch(`/api/address/save`, {
          method: "POST",
          body: JSON.stringify({ address: addr })
        });
        toast("Address saved.", "success");
      } catch { toast("Failed to save address.", "error"); }
    });
  }

  // ===== NAV =====
  function setScreen(name) {
    Object.entries(els.screens).forEach(([k, el]) => el?.classList.toggle("active", k === name));
    els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.target === name));
  }
  function initTabs() {
    els.tabs.forEach(tab => tab.addEventListener("click", () => setScreen(tab.dataset.target)));
  }

  // ===== SERVER USER SYNC =====
  async function syncUser() {
    try {
      const data = await safeFetch(`/api/user/get`);
      if (typeof data.balance === "number") setBalance(data.balance);
      if (typeof data.streak === "number") state.streak = data.streak;
      if (data.lastCheckin) state.lastCheckin = data.lastCheckin;
      renderCheckinTiles();
    } catch { /* ignore */ }
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

    // Referral
    injectReferralStyles(); injectReferralUI(); bindReferralEls(); setReferralLink();

    // HOME
    renderCheckinTiles();
    els.btnClaim?.addEventListener("click", onClickClaimCheckin);

    // NAV/REF/TASK/FORM
    initTabs(); initReferralButtons(); initTasks(); initWithdrawForm(); initAddressForm();

    // Data
    syncUser(); fetchReferrals();

    // Theme
    document.body.dataset.tg = tg?.colorScheme || "light";

    // Home → referral shortcut
    els.btnHomeRefer?.addEventListener?.("click", () => {
      document.querySelector('.tab[data-target="referral"]')?.click();
    });
  }

  init();
})();
