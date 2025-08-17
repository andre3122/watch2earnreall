/* Watch2EarnReall — app.js (FULL)
   - Daily Check-in: kotak besar 2 baris + progress + tombol CLAIM
   - Home Referral card (Start Referring)
   - Task: nonton iklan (Monetag) -> langsung request reward (tanpa modal)
   - Fallback user untuk test di browser
   - Tetap kompatibel dengan section Task/Referral/Profil yang sudah ada
*/
(() => {
  // ===== Telegram & API =====
  const tg = window.Telegram?.WebApp;
  tg?.ready?.(); try { tg?.expand?.(); } catch {}
  const API = (typeof window.API_BASE === "string" ? window.API_BASE : "");

  // ===== STATE =====
  const state = {
    user: tg?.initDataUnsafe?.user || null,
    balance: 0.00,
    streak: 0,
    lastCheckin: null,
    address: localStorage.getItem("bsc_address") || "",
    refCount: 0,
    refBonus: 0,
    tasks: {
      ad1: { completed: false, reward: 0.02 },
      ad2: { completed: false, reward: 0.02 }
    }
  };

  // ===== ELEM =====
  const els = {
    // screens & nav
    screens: {
      home:      document.getElementById("screen-home"),
      task:      document.getElementById("screen-task"),
      referral:  document.getElementById("screen-referral"),
      profile:   document.getElementById("screen-profile"),
    },
    tabs: document.querySelectorAll(".tabbar .tab"),

    // header
    balance: document.getElementById("balance"),

    // HOME (check-in gaya baru)
    checkinTiles:       document.getElementById("checkinTiles"),
    checkinProgressBar: document.getElementById("checkinProgressBar"),
    btnClaim:           document.getElementById("btnClaim"),
    btnHomeRefer:       document.getElementById("btnHomeRefer"),

    // REFERRAL
    refLink:     document.getElementById("refLink"),
    btnCopyRef:  document.getElementById("btnCopyRef"),
    btnShareRef: document.getElementById("btnShareRef"),
    refCount:    document.getElementById("refCount"),
    refBonus:    document.getElementById("refBonus"),
    refList:     document.getElementById("refList"),

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
  function setBalance(n) { state.balance = Number(n); els.balance && (els.balance.textContent = money(state.balance)); }

  function ensureUser() {
    if (!state.user || !state.user.id) {
      const saved = localStorage.getItem("demo_uid");
      const uid = saved || String(Math.floor(100000 + Math.random() * 900000));
      if (!saved) localStorage.setItem("demo_uid", uid);
      state.user = { id: uid, first_name: "Guest", username: "guest" };
    }
  }

  async function safeFetch(url, options) {
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data || {};
  }

  function toast(msg, title="Info") {
    if (tg?.showPopup) tg.showPopup({ title, message: msg, buttons: [{ id:"ok", type:"default", text:"OK"}] });
    else console.log(`[${title}]`, msg);
  }

  // ====== PERSIST / DATE ======
  function loadPersisted() {
    const s = localStorage.getItem("checkin_state");
    if (s) {
      try {
        const j = JSON.parse(s);
        state.streak = j.streak || 0;
        state.lastCheckin = j.lastCheckin || null;
      } catch {}
    }
    if (state.address) els.bscAddress && (els.bscAddress.value = state.address);
  }
  function saveCheckin() {
    localStorage.setItem("checkin_state", JSON.stringify({
      streak: state.streak,
      lastCheckin: state.lastCheckin
    }));
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  // ====== HOME: CHECK-IN UI BARU ======
  function canClaimToday() {
    const today = todayStr();
    return state.lastCheckin !== today && state.streak < 7;
  }

  function renderCheckinTiles() {
    if (!els.checkinTiles) return;
    const days = [1,2,3,4,5,6,7];
    const next = Math.min(state.streak + 1, 7);

    els.checkinTiles.innerHTML = days.map(d => {
      let cls = "day-tile";
      if (d <= state.streak) cls += " done";
      else if (d === next && canClaimToday()) cls += " current";
      else if (d > next) cls += " locked";
      return `<div class="${cls}" data-day="${d}">Day ${d}<small>${d*2}</small></div>`;
    }).join("");

    // progress bar
    if (els.checkinProgressBar) {
      const pct = (state.streak / 7) * 100;
      els.checkinProgressBar.style.width = `${pct}%`;
    }

    // tombol claim
    if (els.btnClaim) {
      els.btnClaim.disabled = !canClaimToday();
      const span = els.btnClaim.querySelector("#claimText");
      if (span) span.textContent = canClaimToday() ? "Claim Bonus" : "Sudah Check-in";
    }
  }

  async function claimToday() {
    if (!canClaimToday()) return;
    state.lastCheckin = todayStr();
    state.streak = Math.min(7, (state.streak || 0) + 1);
    saveCheckin();
    renderCheckinTiles();
    // (opsional) kasih reward kecil untuk check-in, set ke 0 kalau tak mau
    setBalance(state.balance + 0);
    toast("Check-in hari ini berhasil!", "Claimed");
  }

  // ====== TASKS (tanpa modal) ======
  function initTasks() {
    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn => {
      btn.addEventListener("click", async () => {
        const taskId = btn.closest(".task-card")?.dataset?.taskId;
        if (!taskId) return;
        if (state.tasks[taskId]?.completed) return;

        // Tampilkan iklan Monetag (jika fungsi ada)
        try {
          const fn = window[window.MONETAG_FN];
          if (typeof fn === "function") fn();
        } catch {}

        // Langsung verifikasi ke server
        try {
          const data = await safeFetch(`/api/reward/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: String(state.user?.id), task_id: taskId })
          });

          if (data?.credited) {
            state.tasks[taskId].completed = true;
            setBalance(state.balance + (state.tasks[taskId].reward || 0));
            btn.disabled = true;
            toast("Reward ditambahkan!", "Berhasil");
          } else {
            toast("Verifikasi gagal.", "Gagal");
          }
        } catch (e) {
          console.error(e);
          toast("Gagal konek server.", "Error");
        }
      });
    });
  }

  // ====== REFERRAL ======
  function setReferralLink() {
    const id = state.user?.id || "guest";
    const link = `https://t.me/${window.BOT_USERNAME}?start=ref_${id}`;
    els.refLink && (els.refLink.value = link);
  }
  function copy(text) {
    try { navigator.clipboard.writeText(text); toast("Copied!"); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); toast("Copied!");
    }
  }
  function initReferralButtons() {
    els.btnCopyRef?.addEventListener("click", () => els.refLink && copy(els.refLink.value));
    els.btnShareRef?.addEventListener("click", () => {
      const url  = els.refLink?.value || "";
      const text = "Join Watch2EarnReall dan dapatkan reward nonton iklan!";
      if (navigator.share) navigator.share({ title: "Watch2EarnReall", text, url }).catch(()=>{});
      else copy(url);
    });

    // Tombol referral di Home
    els.btnHomeRefer?.addEventListener("click", () => {
      const url  = els.refLink?.value || `https://t.me/${window.BOT_USERNAME}?start=ref_${state.user?.id||"guest"}`;
      const text = "Join Watch2EarnReall dan dapatkan reward nonton iklan!";
      if (navigator.share) navigator.share({ title:"Watch2EarnReall", text, url }).catch(()=>{});
      else document.querySelector('.tab[data-target="referral"]')?.click();
    });
  }
  async function fetchReferrals() {
    try {
      const data = await safeFetch(`/api/referrals?user_id=${encodeURIComponent(state.user?.id || "guest")}`);
      els.refCount && (els.refCount.textContent = data?.count ?? 0);
      els.refBonus && (els.refBonus.textContent = `$${(Number(data?.bonus || 0)).toFixed(2)}`);
      const list = Array.isArray(data?.list) ? data.list : [];
      els.refList && (els.refList.innerHTML = list.map(r => (
        `<div class="ref-item"><div class="avatar"></div><div>${r?.name || "User"}<br><small>${r?.joined || ""}</small></div></div>`
      )).join(""));
    } catch {}
  }

  // ====== PROFILE / WITHDRAW / ADDRESS ======
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
      if (isNaN(amount) || amount < 1) return toast("Minimum withdraw 1$");
      if (!state.address) return toast("Isi alamat BEP20 dulu.");
      try {
        const data = await safeFetch(`/api/withdraw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: String(state.user?.id), amount, address: state.address })
        });
        if (data?.ok) { toast("Permintaan withdraw dikirim."); els.withdrawAmount.value = ""; }
        else { toast(data?.error || "Gagal withdraw."); }
      } catch { toast("Gagal konek server."); }
    });
  }

  function initAddressForm() {
    els.addressForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = (els.bscAddress.value || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast("Alamat BEP20 tidak valid.");
      state.address = addr; localStorage.setItem("bsc_address", addr);
      try {
        await safeFetch(`/api/address/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: String(state.user?.id), address: addr })
        });
        toast("Alamat disimpan.");
      } catch { toast("Gagal menyimpan alamat (server)."); }
    });
  }

  // ====== NAV ======
  function setScreen(name) {
    Object.entries(els.screens).forEach(([k, el]) => el?.classList.toggle("active", k === name));
    els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.target === name));
  }
  function initTabs() {
    els.tabs.forEach(tab => tab.addEventListener("click", () => setScreen(tab.dataset.target)));
  }

  // ====== INIT ======
  function init() {
    // Pemadam kebakaran: kalau ada sisa class modal-open
    try { document.body.classList.remove("modal-open"); } catch {}
    ensureUser();
    loadPersisted();
    setProfile();
    setReferralLink();
    setBalance(state.balance);

    // HOME
    renderCheckinTiles();
    els.btnClaim?.addEventListener("click", claimToday);

    // NAV/REF/TASK/FORM
    initTabs();
    initReferralButtons();
    initTasks();
    initWithdrawForm();
    initAddressForm();

    // Fetch data ringan
    fetchReferrals();

    // Theme
    document.body.dataset.tg = tg?.colorScheme || "light";
  }
  init();
})();
