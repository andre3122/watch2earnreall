/* Watch2EarnReall — app.js (FINAL)
   - CHECK-IN: REMOVED (UI + logic dimatikan total)
   - TASKS (watch ads): server-validated, UI toast +$0.01, saldo ikut server
   - REFERRAL, WITHDRAW, PROFILE, TABS: tetap berjalan seperti sebelumnya
   - Telegram initData dikirim via header untuk auth (prod); fallback dev header di browser
*/

(() => {
  // ===== Telegram & API =====
  const tg = window.Telegram?.WebApp;
  tg?.ready?.(); try { tg?.expand?.(); } catch {}
  // Jika backend kamu beda origin (Railway dsb), isi base URL di sini:
  const API = ""; // contoh: "https://your-backend.railway.app"

  // ===== STATE =====
  const state = {
    user: tg?.initDataUnsafe?.user || null,
    balance: 0.00,
    address: localStorage.getItem("bsc_address") || "",
  };

  // ===== ELEM =====
  const els = {
    screens: {
      home:      document.getElementById("screen-home"),
      task:      document.getElementById("screen-task"),
      referral:  document.getElementById("screen-referral"),
      profile:   document.getElementById("screen-profile"),
    },
    tabs:     document.querySelectorAll(".tabbar .tab"),
    balance:  document.getElementById("balance"),

    // TASK (opsional label reward di UI)
    taskRewardLabels: document.querySelectorAll("[data-reward-label]"),

    // REFERRAL / PROFILE / WITHDRAW
    profileAvatar:   document.getElementById("profileAvatar"),
    profileName:     document.getElementById("profileName"),
    profileUsername: document.getElementById("profileUsername"),
    withdrawForm:    document.getElementById("withdrawForm"),
    withdrawAmount:  document.getElementById("withdrawAmount"),
    addressForm:     document.getElementById("addressForm"),
    bscAddress:      document.getElementById("bscAddress"),
  };

  // ===== CONFIG =====
  const TASK_REWARD = 0.01; // UI display only; server tetap sumber kebenaran

  // ===== HELPERS =====
  function money(n){ return `$${Number(n).toFixed(2)}`; }
  function setBalance(n){ state.balance = Number(n||0); if (els.balance) els.balance.textContent = money(state.balance); }

  // Fallback user untuk dev (non-telegram web)
  function ensureUser(){
    if (!state.user || !state.user.id) {
      const saved = localStorage.getItem("demo_uid");
      const uid   = saved || String(Math.floor(100000 + Math.random() * 900000));
      if (!saved) localStorage.setItem("demo_uid", uid);
      state.user = { id: uid, first_name: "Guest", username: "guest" };
    }
  }

  // Fetch wrapper (kirim header Telegram / test)
  async function safeFetch(path, options = {}){
    const headers = { "Content-Type": "application/json", ...(options.headers||{}) };
    const tgRaw = window.Telegram?.WebApp?.initData || "";
    if (tgRaw) {
      headers["x-telegram-init-data"] = tgRaw; // PROD
    } else {
      // DEV fallback (browser)
      let uid = localStorage.getItem("demo_uid");
      if (!uid){ uid = String(Math.floor(Math.random()*9e9)+1e9); localStorage.setItem("demo_uid", uid); }
      headers["x-telegram-test-user"] = JSON.stringify({ id: uid, first_name: "Guest", username: "guest" });
    }
    const url = (API ? API : "") + path;
    const res  = await fetch(url, { ...options, headers });
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data || {};
  }

  // ===== Top Toast =====
  let toastTimer = null;
  function injectToastStyles(){
    if (document.getElementById("topToastStyles")) return;
    const s = document.createElement("style");
    s.id = "topToastStyles";
    s.textContent = `
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
    document.head.appendChild(s);
  }
  function updateSafeTop(){
    const inset = (window.Telegram?.WebApp?.safeAreaInset?.top || 0);
    const topPx = Math.max(8, inset || 0) + 8;
    document.documentElement.style.setProperty("--safe-top", `${topPx}px`);
  }
  function ensureToastEl(){
    injectToastStyles(); updateSafeTop();
    let el = document.getElementById("topToast");
    if (!el){ el = document.createElement("div"); el.id = "topToast"; el.innerHTML = `<span class="ticon">✔</span><span class="tmsg"></span>`; document.body.appendChild(el); }
    return el;
  }
  function toast(message, type="success"){
    const el = ensureToastEl();
    el.classList.remove("success","error");
    if (type) el.classList.add(type);
    el.querySelector(".tmsg").textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> el.classList.remove("show"), 1600);
  }

  // ===== Hapus CHECK-IN (UI + logic) =====
  function killCheckinUI(){
    // Bersihkan elemen umum check-in bila masih ada
    ["btnClaim","checkinTiles","checkinProgressBar","btnHomeRefer"].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    // Hapus section/card check-in bila ada
    const sec = document.querySelector('[data-section="checkin"], .checkin-section, #section-checkin');
    if (sec) sec.remove();
    // Netralisir handler global lama jika ada
    window.onClickClaimCheckin = function(){ return false; };
  }

  // ===== TASKS (WATCH ADS) — reward UI 0.01, saldo ikut server =====
  function paintTaskRewardLabels(){
    els.taskRewardLabels?.forEach(el => { el.textContent = money(TASK_REWARD); });
  }

  function initTasks(){
    paintTaskRewardLabels();

    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn=>{
      if (btn.__bound) return; btn.__bound = true;

      btn.addEventListener("click", async ()=>{
        try{
          const card = btn.closest(".task-card");
          const taskId = card?.dataset?.taskId;
          if (!taskId) return;

          // (opsional) panggil iklan
          try { const fn = window[window.MONETAG_FN]; if (typeof fn === "function") fn(); } catch {}

          // 1) start session — client minta 0.01 (server yang mutusin)
          const start = await safeFetch(`/api/task/create`, {
            method: "POST",
            body: JSON.stringify({ task_id: taskId, reward: TASK_REWARD })
          });
          if (!start?.ok || !start.token) return toast(start?.error || "Gagal mulai task.", "error");

          const token   = start.token;
          const waitSec = Number(start.wait_seconds || 16);

          // 2) tunggu durasi nonton
          await new Promise(r => setTimeout(r, waitSec * 1000));

          // 3) complete → credit dari server
          async function tryComplete(){
            const data = await safeFetch(`/api/reward/complete`, {
              method: "POST",
              body: JSON.stringify({ task_id: taskId, token, reward: TASK_REWARD })
            });

            if (data?.credited){
              btn.disabled = true;

              // UI: tampilkan +$0.01 (hanya tampilan). Saldo SELALU ikut server.
              toast(`+$${TASK_REWARD.toFixed(2)}`, "success");

              if (typeof data.balance === "number") {
                setBalance(data.balance);
              } else {
                await syncUser(); // tarik dari server jika balance tidak dikirim
              }
              return;
            }
            if (data?.awaiting && data.wait_seconds > 0){
              await new Promise(r => setTimeout(r, Number(data.wait_seconds)*1000));
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

  // ===== REFERRAL / PROFILE / WITHDRAW (tidak diubah logic earning) =====
  function setProfile(){
    try{
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      state.user = u || state.user;
      if (els.profileAvatar)   els.profileAvatar.src = u?.photo_url || "assets/images/avatar.svg";
      if (els.profileName)     els.profileName.textContent = u?.first_name || "Guest";
      if (els.profileUsername) els.profileUsername.textContent = u?.username ? `@${u.username}` : "—";
    } catch {}
  }

  function initWithdrawForm(){
    els.withdrawForm?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const amount = Number(els.withdrawAmount.value || 0);
      if (!amount || amount < 1) return toast("Minimum withdraw is $1.00", "error");
      try{
        const data = await safeFetch(`/api/withdraw`, { method:"POST", body: JSON.stringify({ amount, address: state.address }) });
        if (data?.ok){ toast("Withdrawal request submitted.", "success"); els.withdrawAmount.value = ""; }
        else { toast(data?.error || "Withdraw failed.", "error"); }
      } catch { toast("Failed to reach server.", "error"); }
    });
  }

  function initAddressForm(){
    els.addressForm?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const addr = (els.bscAddress.value || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast("Invalid BEP20 address.", "error");
      state.address = addr; localStorage.setItem("bsc_address", addr);
      try{
        await safeFetch(`/api/address/save`, { method:"POST", body: JSON.stringify({ address: addr }) });
        toast("Address saved.", "success");
      } catch { toast("Failed to save address.", "error"); }
    });
  }

  // ===== NAV =====
  function setScreen(name){
    Object.entries(els.screens).forEach(([k, el]) => el?.classList.toggle("active", k === name));
    els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.target === name));
  }
  function initTabs(){ els.tabs.forEach(tab => tab.addEventListener("click", () => setScreen(tab.dataset.target))); }

  // ===== USER SYNC (saldo dari server) =====
  async function syncUser(){
    try{
      const data = await safeFetch(`/api/user/get`);
      const u = (data && data.user) ? data.user : data;
      if (u && typeof u.balance === "number") setBalance(u.balance);
    } catch {/* ignore */}
  }

  // ===== INIT =====
  function init(){
    ensureUser();
    setProfile();
    setBalance(state.balance);

    // Toast & safe area
    injectToastStyles(); updateSafeTop();
    window.addEventListener("resize", updateSafeTop);
    window.Telegram?.WebApp?.onEvent?.("viewportChanged", updateSafeTop);

    // Matikan CHECK-IN
    killCheckinUI();

    // NAV / TASKS / FORMS
    initTabs();
    initTasks();
    initWithdrawForm();
    initAddressForm();

    // Data
    syncUser();

    // Theme
    document.body.dataset.tg = tg?.colorScheme || "light";
  }

  // Ekspor helper bila perlu dipakai patch lain
  window.safeFetch  = safeFetch;
  window.setBalance = setBalance;
  window.syncUser   = syncUser;

  init();
})();
