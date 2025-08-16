/* Watch2EarnReall – Client for Vercel fullstack
   - FIX modal: tombol "Selesai" bisa diklik (z-index + block tabbar)
   - Fallback user_id saat tidak dibuka dari Telegram (testing via browser)
   - Menu: Home/Task/Referral/Profil sesuai brief
*/
(() => {
  const tg = window.Telegram?.WebApp;
  tg?.ready?.();
  try { tg?.expand?.(); } catch {}

  // Base URL API: kalau backend & frontend 1 proyek Vercel, biarkan kosong di config.js
  const API = (typeof window.API_BASE === "string" ? window.API_BASE : "");
  const call = (path, opt = {}) => fetch(`${API}${path}`, opt);

  // ======= STATE & ELEM =======
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

  const els = {
    screens: {
      home: document.getElementById("screen-home"),
      task: document.getElementById("screen-task"),
      referral: document.getElementById("screen-referral"),
      profile: document.getElementById("screen-profile"),
    },
    tabs: document.querySelectorAll(".tabbar .tab"),

    // Header
    balance: document.getElementById("balance"),

    // Home / check-in
    checkinGrid: document.getElementById("checkinGrid"),
    btnCheckin: document.getElementById("btnCheckin"),
    streakInfo: document.getElementById("streakInfo"),

    // Referral
    refLink: document.getElementById("refLink"),
    btnCopyRef: document.getElementById("btnCopyRef"),
    btnShareRef: document.getElementById("btnShareRef"),
    refCount: document.getElementById("refCount"),
    refBonus: document.getElementById("refBonus"),
    refList: document.getElementById("refList"),

    // Profil / withdraw / address
    profileAvatar: document.getElementById("profileAvatar"),
    profileName: document.getElementById("profileName"),
    profileUsername: document.getElementById("profileUsername"),
    withdrawForm: document.getElementById("withdrawForm"),
    withdrawAmount: document.getElementById("withdrawAmount"),
    addressForm: document.getElementById("addressForm"),
    bscAddress: document.getElementById("bscAddress"),

    // Modal
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalTitle: document.getElementById("modalTitle"),
    modalMsg: document.getElementById("modalMsg"),
    modalCancel: document.getElementById("modalCancel"),
    modalOk: document.getElementById("modalOk"),
  };

  // ======= HELPERS =======
  function money(n) { return `$${Number(n).toFixed(2)}`; }
  function setBalance(n) { state.balance = Number(n); els.balance.textContent = money(state.balance); }

  // Fallback user jika tidak dibuka dari Telegram (biar bisa test di browser biasa)
  function ensureUser() {
    if (!state.user || !state.user.id) {
      const saved = localStorage.getItem("demo_uid");
      const uid = saved || String(Math.floor(100000 + Math.random() * 900000));
      if (!saved) localStorage.setItem("demo_uid", uid);
      state.user = { id: uid, first_name: "Guest", username: "guest" };
    }
  }

  // Fetch dengan error yang lebih jelas
  async function safeFetch(url, options) {
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data || {};
  }

  // ======= MODAL (FIX: z-index + block tabbar) =======
  function showModal({ title, message, onOk, onCancel }) {
    // isi judul & pesan
    if (els.modalTitle) els.modalTitle.textContent = title || "Konfirmasi";
    if (els.modalMsg) els.modalMsg.textContent = message || "";

    // tampilkan modal
    els.modalBackdrop.hidden = false;

    // KUNCI: saat modal terbuka, matikan scroll & klik di belakang (termasuk tabbar)
    document.body.classList.add("modal-open");

    const ok = () => { cleanup(); onOk && onOk(); };
    const cancel = () => { cleanup(); onCancel && onCancel(); };

    function cleanup() {
      els.modalBackdrop.hidden = true;
      document.body.classList.remove("modal-open");
      els.modalOk.removeEventListener("click", ok);
      els.modalCancel.removeEventListener("click", cancel);
    }

    els.modalOk.addEventListener("click", ok);
    els.modalCancel.addEventListener("click", cancel);
  }

  function toast(msg) {
    if (tg?.showPopup) {
      tg.showPopup({ title: "Info", message: msg, buttons: [{ id: "ok", type: "default", text: "OK" }] });
    } else {
      console.log("[Toast]", msg);
    }
  }

  // ======= HOME: Daily Check-In (local only demo) =======
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
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function canCheckinToday() { return state.lastCheckin !== todayStr(); }

  function renderCheckinGrid() {
    els.checkinGrid?.querySelectorAll("li").forEach((li, idx) => {
      li.style.setProperty("--start", `${idx * 40}deg`);
      const day = Number(li.dataset.day);
      li.classList.toggle("active", day <= state.streak);
      li.classList.toggle("checked", day <= state.streak);
    });
    els.streakInfo && (els.streakInfo.innerHTML = `Streak: <strong>${state.streak}</strong> hari`);
    if (els.btnCheckin) {
      els.btnCheckin.disabled = !canCheckinToday();
      els.btnCheckin.textContent = canCheckinToday() ? "Check-in Hari Ini" : "Sudah Check-in";
    }
  }

  async function handleCheckin() {
    if (!canCheckinToday()) return;
    state.lastCheckin = todayStr();
    state.streak = Math.min(7, (state.streak || 0) + 1);
    saveCheckin();
    renderCheckinGrid();
    toast("Check-in berhasil!");
  }

  // ======= TASKS =======
  function showMonetagAd() {
    // Panggil fungsi iklan Monetag (sudah diset di config.js/index.html), lalu minta user menekan Selesai
    const fn = window[window.MONETAG_FN];
    try { if (typeof fn === "function") fn(); } catch {}
    return new Promise(resolve => showModal({
      title: "Iklan",
      message: "Tonton iklan sampai selesai lalu tekan Selesai. Sistem akan verifikasi reward dari server.",
      onOk: () => resolve(true),
      onCancel: () => resolve(false)
    }));
  }

  async function completeTask(taskId){
  try {
    // 1) Tampilkan iklan Monetag (kalau ada)
    const fn = window[window.MONETAG_FN];
    try { if (typeof fn === "function") fn(); } catch {}

    // 2) Langsung minta reward ke server (tanpa modal)
    const res = await fetch(`/api/reward/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: String(state.user?.id),   // pastikan string
        task_id: taskId
      })
    });
    const data = await res.json();

    if (data?.credited) {
      // tandai selesai & tambah saldo
      state.tasks[taskId].completed = true;
      setBalance(state.balance + (state.tasks[taskId].reward || 0));

      // matikan tombol task yg barusan
      const btn = document.querySelector(`[data-task-id="${taskId}"] [data-action="watch"]`);
      if (btn) btn.disabled = true;

      // notifikasi kecil
      if (window.Telegram?.WebApp?.showPopup) {
        Telegram.WebApp.showPopup({ title: "Berhasil", message: "Reward ditambahkan!", buttons: [{id:"ok", type:"default", text:"OK"}] });
      }
    } else {
      if (window.Telegram?.WebApp?.showPopup) {
        Telegram.WebApp.showPopup({ title: "Gagal", message: "Verifikasi gagal.", buttons: [{id:"ok", type:"default", text:"OK"}] });
      }
    }
  } catch (e) {
    if (window.Telegram?.WebApp?.showPopup) {
      Telegram.WebApp.showPopup({ title: "Error", message: "Gagal konek server.", buttons: [{id:"ok", type:"default", text:"OK"}] });
    }
    console.error(e);
  }
}


  function initTasks() {
    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn => {
      btn.addEventListener("click", () => {
        const taskId = btn.closest(".task-card")?.dataset?.taskId;
        if (!taskId) return;
        if (state.tasks[taskId]?.completed) return;
        completeTask(taskId);
      });
    });
  }

  // ======= REFERRAL =======
  function setReferralLink() {
    const id = state.user?.id || "guest";
    const link = `https://t.me/${window.BOT_USERNAME}?start=ref_${id}`;
    els.refLink && (els.refLink.value = link);
  }
  function copy(text) {
    try {
      navigator.clipboard.writeText(text);
      toast("Copied!");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copied!");
    }
  }
  function initReferralButtons() {
    els.btnCopyRef?.addEventListener("click", () => copy(els.refLink.value));
    els.btnShareRef?.addEventListener("click", () => {
      const url = els.refLink.value;
      const text = "Join Watch2EarnReall dan dapatkan reward nonton iklan!";
      if (navigator.share) {
        navigator.share({ title: "Watch2EarnReall", text, url }).catch(() => {});
      } else copy(url);
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
    } catch {
      // biarkan kosong saat demo
    }
  }

  // ======= PROFIL / WITHDRAW / ADDRESS =======
  function setProfile() {
    const u = state.user;
    const name = u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "Guest";
    const username = u?.username ? `@${u.username}` : (u ? `id:${u.id}` : "@guest");
    els.profileName && (els.profileName.textContent = name);
    els.profileUsername && (els.profileUsername.textContent = username);

    const photo = u?.photo_url;
    if (photo && els.profileAvatar) {
      const img = new Image();
      img.src = photo;
      img.alt = "Avatar";
      els.profileAvatar.innerHTML = "";
      els.profileAvatar.appendChild(img);
    } else if (els.profileAvatar) {
      const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
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

  // ======= NAV =======
  function setScreen(name) {
    Object.entries(els.screens).forEach(([k, el]) => el?.classList.toggle("active", k === name));
    els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.target === name));
  }
  function initTabs() {
    els.tabs.forEach(tab => tab.addEventListener("click", () => setScreen(tab.dataset.target)));
  }

  // ======= INIT =======
  function init() {
    ensureUser();
    loadPersisted();
    setProfile();
    setReferralLink();
    setBalance(state.balance);
    renderCheckinGrid();
    initTabs();
    initReferralButtons();
    initTasks();
    initWithdrawForm();
    initAddressForm();
    els.btnCheckin?.addEventListener("click", handleCheckin);
    fetchReferrals();
    document.body.dataset.tg = tg?.colorScheme || "light";
  }
  init();
})();
