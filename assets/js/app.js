/* Watch2EarnReall — app.js (EN, server-validated) - Daily Check-in, Task-based rewards, Withdraw, Referral
 * Notes:
 * - Uses Telegram Mini App. In dev (non-Telegram browser), safeFetch sends x-telegram-test-user.
 * - Rewards are server-validated; balances live on DB; referral page shows counts & earnings.
 * - UI: minimal vanilla JS + CSS variables. No build step required.
 */

(function () {
  "use strict";

  // ===== Public config injected from assets/js/config.js =====
  const API_BASE = (window.API_BASE || "");
  const TG_BOT_NAME = (window.TG_BOT_NAME || "watch2earnreall_bot");
  const CHECKIN_REWARDS = window.CHECKIN_REWARDS || [0.01, 0.01, 0.02, 0.02, 0.03, 0.05, 0.10];
  const REF_PERCENT = Number(window.REF_PERCENT || 0.15);

  // ===== DOM refs =====
  const els = {
    bal: document.querySelector("#balanceAmt"),
    username: document.querySelector("#username"),
    streak: document.querySelector("#streak"),
    lastCheckin: document.querySelector("#lastCheckin"),
    btnCheckin: document.querySelector("#btnCheckin"),
    checkinGrid: document.querySelector("#checkinGrid"),
    btnHomeRefer: document.querySelector("#btnHomeRefer"),
    withdrawForm: document.querySelector("#withdrawForm"),
    addressForm: document.querySelector("#addressForm"),
    addrInput: document.querySelector("#addressInput"),
    addrSaveBtn: document.querySelector("#addressSaveBtn"),
    refList: document.querySelector("#refList"),
  };

  // ===== App state =====
  const state = {
    balance: 0,
    tgUser: null,
    lastCheckin: null,
    streak: 0,
    tasks: {
      ad1: { completed: false, reward: 0.01 },
      ad2: { completed: false, reward: 0.01 }
    }
  };
  window.state = state; // for debug

  // ===== Fetch wrapper (sends Telegram init data or dev header) =====
  async function safeFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const tgRaw = window.Telegram?.WebApp?.initData || "";

    if (tgRaw) {
      headers["x-telegram-init-data"] = tgRaw; // production (Mini App)
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

  // ===== Top Toast (safe-area aware) =====
  let toastTimer = null;
  function injectToastStyles() {
    if (document.getElementById("topToastStyles")) return;
    const style = document.createElement("style");
    style.id = "topToastStyles";
    style.textContent = `
      :root { --safe-top: 8px; }
      #topToast{ position:fixed; left:50%; transform:translateX(-50%); top:var(--safe-top);
        z-index:9999; background:#101826; color:#fff; padding:10px 14px; border-radius:999px; display:flex; align-items:center;
        gap:8px; box-shadow:0 6px 20px rgba(0,0,0,.25); opacity:0; pointer-events:none; transition:.25s ease; }
      #topToast.show{ opacity:1; pointer-events:auto; }
      #topToast.success{ background: linear-gradient(90deg,#14c38e,#24c7b7); }
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

  // ===== Reward Popup =====
  function ensureRewardStyles() {
    if (document.getElementById("rewardPopupStyles")) return;
    const style = document.createElement("style");
    style.id = "rewardPopupStyles";
    style.textContent = `
      #rewardPop{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(10,12,20,.38);
        z-index:10000; opacity:0; pointer-events:none; transition:.2s ease; }
      #rewardPop.show{ opacity:1; pointer-events:auto; }
      #rewardPop .rp-card{ position:relative; width:min(420px,86vw); background:#0f172a; border:1px solid rgba(255,255,255,.08);
        color:#e5f2ff; padding:20px 20px 12px; border-radius:16px; transform:scale(.98); transition:.2s ease; overflow:hidden; }
      #rewardPop .rp-sheen{ position:absolute; inset:-1px; background:linear-gradient(120deg, rgba(79,209,202,.25), transparent 30%, transparent 70%, rgba(103,214,255,.18));
        filter: blur(10px); opacity:.35; pointer-events:none; }
      #rewardPop .rp-coin{ font-size:38px; line-height:1; }
      #rewardPop .rp-amt{ font-size:36px; font-weight:700; margin:6px 0 8px; }
      #rewardPop .rp-msg{ opacity:.9; }
      #rewardPop .rp-actions{ margin-top:12px; text-align:right; }
      #rewardPop .rp-actions .rp-ok{ background:#1e293b; color:#e5f2ff; border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:8px 12px; }
      #rewardPop .rp-actions .rp-ok:active{ transform:translateY(1px); }
    `;
    document.head.appendChild(style);
  }
  function showRewardPopup(amount, message) {
    ensureRewardStyles();
    const old = document.getElementById("rewardPop"); if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "rewardPop";
    wrap.innerHTML = `
      <div class="rp-card">
        <div class="rp-sheen"></div>
        <div class="rp-coin">★</div>
        <div class="rp-amt">+${amount}</div>
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

  // ===== Balance helpers =====
  function setBalance(n) {
    state.balance = Number(n || 0);
    if (els.bal) els.bal.textContent = `$${state.balance.toFixed(2)}`;
  }

  // ===== Check-in UI =====
  function renderCheckinTiles() {
    if (!els.checkinGrid) return;
    const items = CHECKIN_REWARDS.map((r, i) => {
      const d = i + 1;
      const reward = CHECKIN_REWARDS[d - 1].toFixed(2);
      return `<div class="tile" data-day="${d}">Day ${d}<small>${reward}</small></div>`;
    }).join("");
    els.checkinGrid.innerHTML = items;
  }

  // ===== API usage =====
  function initTabs() {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.target;
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("show"));
        document.querySelector(`#screen-${target}`)?.classList.add("show");
      });
    });
  }

  function initReferralButtons() {
    document.querySelectorAll("[data-share-ref]").forEach(btn => {
      btn.addEventListener("click", () => {
        const u = state.tgUser?.username || "";
        const link = `https://t.me/${TG_BOT_NAME}?start=${encodeURIComponent(u||"ref")}`;
        if (navigator.share) {
          navigator.share({ title: "Join me", text: "Watch2Earn", url: link }).catch(()=>{});
        } else {
          navigator.clipboard.writeText(link).then(()=> toast("Link disalin!", "success"));
        }
      });
    });
  }

  function initWithdrawForm() {
    if (!els.withdrawForm) return;
    els.withdrawForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amt = Number(els.withdrawForm.querySelector("input[name='amount']")?.value || 0);
      if (!amt || amt <= 0) return toast("Nominal invalid.", "error");
      try {
        const data = await safeFetch(`/api/withdraw`, {
          method: "POST",
          body: JSON.stringify({ amount: amt })
        });
        if (data?.ok) toast("Withdraw requested.", "success");
        else toast(data?.error || "Withdraw failed.", "error");
      } catch {
        toast("Failed to reach server.", "error");
      }
    });
  }

  function initAddressForm() {
    if (!els.addressForm) return;
    els.addressForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = (els.addrInput?.value || "").trim();
      if (!addr) return toast("Alamat kosong.", "error");
      try {
        await safeFetch(`/api/address/save`, { method: "POST", body: JSON.stringify({ address: addr }) });
        toast("Address saved.", "success");
      } catch {
        toast("Failed to reach server.", "error");
      }
    });
  }

  async function syncUser() {
    try {
      const data = await safeFetch(`/api/user/get`);
      state.tgUser = data?.tgUser || null;
      setBalance(data?.user?.balance || 0);
      if (els.username) els.username.textContent = state.tgUser?.username || "";
      state.streak = data?.user?.streak || 0;
      state.lastCheckin = data?.user?.last_checkin || null;
      if (els.streak) els.streak.textContent = String(state.streak || 0);
      if (els.lastCheckin) els.lastCheckin.textContent = state.lastCheckin ? new Date(state.lastCheckin).toLocaleString() : "-";
    } catch {
      toast("Failed to reach server.", "error");
    }
  }

  async function fetchReferrals() {
    try {
      const data = await safeFetch(`/api/referrals`);
      if (Array.isArray(data?.refs)) {
        els.refList.innerHTML = data.refs.map(r => `<li>@${r.username} — $${Number(r.earned||0).toFixed(2)}`).join("");
      }
    } catch {}
  }

  async function claimToday() {
    try {
      const data = await safeFetch(`/api/checkin/claim`, { method: "POST", body: JSON.stringify({}) });
      if (data?.ok) {
        state.streak = data.streak ?? state.streak;
        state.lastCheckin = data.lastCheckin ?? state.lastCheckin;
        setBalance(data.balance ?? state.balance);
        renderCheckinTiles();
        toast(`Check-in successful! +$${Number(data.amount||0).toFixed(2)}`, "success");
      } else {
        toast(data?.error || "Check-in failed.", "error");
      }
    } catch {
      toast("Failed to reach server.", "error");
    }
  }

  // ===== TASKS (server-timer) =====
  function initTasks() {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn => {
      if (btn.__serverTimerBound) return;
      btn.__serverTimerBound = true;

      btn.addEventListener("click", async () => {
        try {
          const taskId = btn.closest(".task-card")?.dataset?.taskId;
          if (!taskId) return;
          if (state.tasks?.[taskId]?.completed) return;

          // Optional: panggil iklan kalau ada
          try { const fn = window[window.MONETAG_FN]; if (typeof fn === "function") fn(); } catch {}

          // 1) Mulai task → server bikin sesi & token
          const start = await safeFetch(`/api/task/create`, {
            method: "POST",
            body: JSON.stringify({ task_id: taskId })
          });
          if (!start?.ok || !start.token) {
            return toast(start?.error || "Gagal mulai task.", "error");
          }

          const token = start.token;
          const waitSec = Number(start.wait_seconds || 16);

          // 2) Tunggu minimal X detik
          await new Promise(r => setTimeout(r, waitSec * 1000));

          // 3) Minta kredit ke server (auto retry kalau belum cukup)
          async function tryComplete() {
            const data = await safeFetch(`/api/reward/complete`, {
              method: "POST",
              body: JSON.stringify({ task_id: taskId, token })
            });

            if (data?.credited) {
              const amt = typeof data.amount === "number" ? data.amount : (state.tasks?.[taskId]?.reward || 0);
              state.tasks = state.tasks || {};
              state.tasks[taskId] = state.tasks[taskId] || {};
              state.tasks[taskId].completed = true;

              setBalance(data.balance ?? ((state.balance || 0) + amt));
              btn.disabled = true;
              if (typeof showRewardPopup === "function") showRewardPopup(amt, "Reward added!");
              else toast(`+$${Number(amt).toFixed(2)}`, "success");
              return;
            }

            if (data?.awaiting && data.wait_seconds > 0) {
              await new Promise(r => setTimeout(r, Number(data.wait_seconds) * 1000));
              return tryComplete();
            }

            toast(data?.error || "Verification failed.", "error");
          }

          await tryComplete();
        } catch {
          toast("Failed to reach server.", "error");
        }
      });
    });
  }

  // ===== INIT =====
  function init() {
    const tg = window.Telegram?.WebApp;
    try { tg?.expand?.(); } catch {}

    // Actions
    els.btnCheckin?.addEventListener?.("click", claimToday);

    // Data
    syncUser(); fetchReferrals();

    // Theme
    document.body.dataset.tg = tg?.colorScheme || "light";

    // Home → referral shortcut
    els.btnHomeRefer?.addEventListener?.("click", () => {
      document.querySelector('.tab[data-target="referral"]')?.click();
    });
  }

  initTabs(); initReferralButtons(); initTasks(); initWithdrawForm(); initAddressForm();
  init();
})();
