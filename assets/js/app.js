/* Watch2EarnReall – versi tanpa modal (menu clickable normal) */
(() => {
  const tg = window.Telegram?.WebApp; tg?.ready?.(); try{ tg?.expand?.(); }catch{}
  const API = (typeof window.API_BASE === "string" ? window.API_BASE : "");

  // ======= STATE =======
  const state = {
    user: tg?.initDataUnsafe?.user || null,
    balance: 0.00,
    streak: 0,
    lastCheckin: null,
    address: localStorage.getItem("bsc_address") || "",
    tasks: { ad1: { completed:false, reward:0.02 }, ad2: { completed:false, reward:0.02 } }
  };

  // ======= ELEM =======
  const els = {
    screens:{ home:gid("screen-home"), task:gid("screen-task"), referral:gid("screen-referral"), profile:gid("screen-profile") },
    tabs: document.querySelectorAll(".tabbar .tab"),
    balance: gid("balance"),
    checkinGrid: gid("checkinGrid"), btnCheckin: gid("btnCheckin"), streakInfo: gid("streakInfo"),
    refLink: gid("refLink"), btnCopyRef: gid("btnCopyRef"), btnShareRef: gid("btnShareRef"),
    refCount: gid("refCount"), refBonus: gid("refBonus"), refList: gid("refList"),
    profileAvatar: gid("profileAvatar"), profileName: gid("profileName"), profileUsername: gid("profileUsername"),
    withdrawForm: gid("withdrawForm"), withdrawAmount: gid("withdrawAmount"),
    addressForm: gid("addressForm"), bscAddress: gid("bscAddress"),
  };
  function gid(id){ return document.getElementById(id); }
  function money(n){ return `$${Number(n).toFixed(2)}`; }
  function setBalance(n){ state.balance = Number(n); els.balance.textContent = money(state.balance); }

  // Fallback user kalau dibuka di browser biasa (bukan Telegram)
  function ensureUser(){
    if(!state.user || !state.user.id){
      const saved = localStorage.getItem("demo_uid");
      const uid = saved || String(Math.floor(100000 + Math.random()*900000));
      if(!saved) localStorage.setItem("demo_uid", uid);
      state.user = { id: uid, first_name: "Guest", username: "guest" };
    }
  }

  async function safeFetch(url, options){
    const res = await fetch(url, options);
    let data = null; try{ data = await res.json(); } catch{}
    if(!res.ok) throw new Error((data && (data.error||data.message)) || `HTTP ${res.status}`);
    return data || {};
  }

  // ======= HOME: Daily Check-In =======
  function loadPersisted(){
    const s = localStorage.getItem("checkin_state");
    if(s){ try{ const j=JSON.parse(s); state.streak=j.streak||0; state.lastCheckin=j.lastCheckin||null; }catch{} }
    if(state.address) els.bscAddress && (els.bscAddress.value = state.address);
  }
  function saveCheckin(){ localStorage.setItem("checkin_state", JSON.stringify({ streak:state.streak, lastCheckin:state.lastCheckin })); }
  function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  const canCheckinToday = () => state.lastCheckin !== todayStr();
  function renderCheckinGrid(){
    els.checkinGrid?.querySelectorAll("li").forEach((li,idx)=>{
      li.style.setProperty("--start", `${idx*40}deg`);
      const day = Number(li.dataset.day);
      li.classList.toggle("active", day <= state.streak);
      li.classList.toggle("checked", day <= state.streak);
    });
    els.streakInfo && (els.streakInfo.innerHTML = `Streak: <strong>${state.streak}</strong> hari`);
    if(els.btnCheckin){ els.btnCheckin.disabled = !canCheckinToday(); els.btnCheckin.textContent = canCheckinToday() ? "Check-in Hari Ini" : "Sudah Check-in"; }
  }
  async function handleCheckin(){
    if(!canCheckinToday()) return;
    state.lastCheckin = todayStr();
    state.streak = Math.min(7,(state.streak||0)+1);
    saveCheckin(); renderCheckinGrid();
    tg?.showPopup?.({ title:"Info", message:"Check-in berhasil!", buttons:[{id:"ok",type:"default",text:"OK"}] });
  }

  // ======= TASK: TANPA MODAL =======
  async function completeTask(taskId){
    try {
      // Tampilkan iklan Monetag (jika ada)
      const fn = window[window.MONETAG_FN];
      try{ if(typeof fn === "function") fn(); }catch{}

      // Langsung verifikasi ke server (tanpa modal)
      const data = await safeFetch(`/api/reward/complete`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ user_id:String(state.user?.id), task_id:taskId })
      });

      if(data?.credited){
        state.tasks[taskId].completed = true;
        setBalance(state.balance + (state.tasks[taskId].reward || 0));
        const btn = document.querySelector(`[data-task-id="${taskId}"] [data-action="watch"]`);
        if(btn) btn.disabled = true;
        tg?.showPopup?.({ title:"Berhasil", message:"Reward ditambahkan!", buttons:[{id:"ok",type:"default",text:"OK"}] });
      }else{
        tg?.showPopup?.({ title:"Gagal", message:"Verifikasi gagal.", buttons:[{id:"ok",type:"default",text:"OK"}] });
      }
    } catch {
      tg?.showPopup?.({ title:"Error", message:"Gagal konek server.", buttons:[{id:"ok",type:"default",text:"OK"}] });
    }
  }
  function initTasks(){
    document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const taskId = btn.closest(".task-card")?.dataset?.taskId;
        if(!taskId || state.tasks[taskId]?.completed) return;
        completeTask(taskId);
      });
    });
  }

  // ======= REFERRAL =======
  function setReferralLink(){ const id = state.user?.id || "guest"; const link = `https://t.me/${window.BOT_USERNAME}?start=ref_${id}`; els.refLink && (els.refLink.value = link); }
  function copy(text){
    try{ navigator.clipboard.writeText(text); }catch{
      const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    tg?.showPopup?.({ title:"Info", message:"Copied!", buttons:[{id:"ok",type:"default",text:"OK"}] });
  }
  function initReferralButtons(){
    els.btnCopyRef?.addEventListener("click", ()=>copy(els.refLink.value));
    els.btnShareRef?.addEventListener("click", ()=>{
      const url = els.refLink.value; const text = "Join Watch2EarnReall dan dapatkan reward nonton iklan!";
      if(navigator.share) navigator.share({ title:"Watch2EarnReall", text, url }).catch(()=>{});
      else copy(url);
    });
  }
  async function fetchReferrals(){
    try{
      const data = await safeFetch(`/api/referrals?user_id=${encodeURIComponent(state.user?.id || "guest")}`);
      els.refCount && (els.refCount.textContent = data?.count ?? 0);
      els.refBonus && (els.refBonus.textContent = `$${(Number(data?.bonus||0)).toFixed(2)}`);
      const list = Array.isArray(data?.list) ? data.list : [];
      els.refList && (els.refList.innerHTML = list.map(r => `<div class="ref-item"><div class="avatar"></div><div>${r?.name||"User"}<br><small>${r?.joined||""}</small></div></div>`).join(""));
    }catch{}
  }

  // ======= PROFIL / WITHDRAW / ADDRESS =======
  function setProfile(){
    const u = state.user;
    const name = u ? [u.first_name,u.last_name].filter(Boolean).join(" ") : "Guest";
    const username = u?.username ? `@${u.username}` : (u ? `id:${u.id}` : "@guest");
    els.profileName && (els.profileName.textContent = name);
    els.profileUsername && (els.profileUsername.textContent = username);
    const photo = u?.photo_url;
    if(photo && els.profileAvatar){
      const img=new Image(); img.src=photo; img.alt="Avatar"; els.profileAvatar.innerHTML=""; els.profileAvatar.appendChild(img);
    }else if(els.profileAvatar){
      const initials = name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
      els.profileAvatar.innerHTML = `<div style="display:grid;place-items:center;width:100%;height:100%;color:#fff;font-weight:800;">${initials}</div>`;
    }
  }
  function initWithdrawForm(){
    els.withdrawForm?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const amount = Number(els.withdrawAmount.value);
      if(isNaN(amount) || amount < 1) return tg?.showPopup?.({title:"Info",message:"Minimum withdraw 1$",buttons:[{id:"ok",type:"default",text:"OK"}]});
      if(!state.address) return tg?.showPopup?.({title:"Info",message:"Isi alamat BEP20 dulu.",buttons:[{id:"ok",type:"default",text:"OK"}]});
      try{
        const data = await safeFetch(`/api/withdraw`, {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ user_id:String(state.user?.id), amount, address: state.address })
        });
        if(data?.ok){ tg?.showPopup?.({title:"Berhasil",message:"Permintaan withdraw dikirim.",buttons:[{id:"ok",type:"default",text:"OK"}]}); els.withdrawAmount.value=""; }
      }catch{ tg?.showPopup?.({title:"Error",message:"Gagal konek server.",buttons:[{id:"ok",type:"default",text:"OK"}]}); }
    });
  }
  function initAddressForm(){
    els.addressForm?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const addr = (els.bscAddress.value||"").trim();
      if(!/^0x[a-fA-F0-9]{40}$/.test(addr)) return tg?.showPopup?.({title:"Info",message:"Alamat BEP20 tidak valid.",buttons:[{id:"ok",type:"default",text:"OK"}]});
      state.address = addr; localStorage.setItem("bsc_address", addr);
      try{
        await safeFetch(`/api/address/save`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ user_id:String(state.user?.id), address: addr }) });
        tg?.showPopup?.({title:"Berhasil",message:"Alamat disimpan.",buttons:[{id:"ok",type:"default",text:"OK"}]});
      }catch{}
    });
  }

  // ======= NAV =======
  function setScreen(name){
    Object.entries(els.screens).forEach(([k,el])=>el?.classList.toggle("active", k===name));
    els.tabs.forEach(tab=>tab.classList.toggle("active", tab.dataset.target===name));
  }
  function initTabs(){ els.tabs.forEach(tab=>tab.addEventListener("click", ()=>setScreen(tab.dataset.target))); }

  // ======= INIT =======
  function init(){
    // safety: kalau ada sisa class dari versi lama
    document.body.classList.remove("modal-open");

    ensureUser(); loadPersisted(); setProfile(); setReferralLink();
    setBalance(state.balance); renderCheckinGrid();
    initTabs(); initReferralButtons(); initTasks(); initWithdrawForm(); initAddressForm();
    els.btnCheckin?.addEventListener("click", handleCheckin);
    fetchReferrals();
  }
  init();
})();
