/* app.js sama seperti paket Vercel sebelumnya (memanggil /api) */
(() => {
  const tg = window.Telegram?.WebApp;
  tg?.ready?.(); try { tg?.expand?.(); } catch {}

  const API = (typeof window.API_BASE === "string" ? window.API_BASE : "");
  const call = (path, opt={}) => fetch(`${API}${path}`, opt);

  const state = { user: tg?.initDataUnsafe?.user || null, balance: 0.00, streak: 0, lastCheckin: null, address: localStorage.getItem("bsc_address") || "", refCount: 0, refBonus: 0, tasks: { ad1: { completed:false, reward:0.02 }, ad2: { completed:false, reward:0.02 } } };

  const els = {
    screens:{ home:document.getElementById("screen-home"), task:document.getElementById("screen-task"), referral:document.getElementById("screen-referral"), profile:document.getElementById("screen-profile") },
    tabs:document.querySelectorAll(".tabbar .tab"),
    balance:document.getElementById("balance"),
    streakInfo:document.getElementById("streakInfo"),
    checkinGrid:document.getElementById("checkinGrid"),
    btnCheckin:document.getElementById("btnCheckin"),
    refLink:document.getElementById("refLink"),
    btnCopyRef:document.getElementById("btnCopyRef"),
    btnShareRef:document.getElementById("btnShareRef"),
    refCount:document.getElementById("refCount"),
    refBonus:document.getElementById("refBonus"),
    refList:document.getElementById("refList"),
    profileAvatar:document.getElementById("profileAvatar"),
    profileName:document.getElementById("profileName"),
    profileUsername:document.getElementById("profileUsername"),
    withdrawForm:document.getElementById("withdrawForm"),
    withdrawAmount:document.getElementById("withdrawAmount"),
    addressForm:document.getElementById("addressForm"),
    bscAddress:document.getElementById("bscAddress"),
    modalBackdrop:document.getElementById("modalBackdrop"),
    modalTitle:document.getElementById("modalTitle"),
    modalMsg:document.getElementById("modalMsg"),
    modalCancel:document.getElementById("modalCancel"),
    modalOk:document.getElementById("modalOk"),
  };

  const money = n => `$${Number(n).toFixed(2)}`;
  const setBalance = n => { state.balance = Number(n); els.balance.textContent = money(state.balance); };

  function loadPersisted(){ const s = localStorage.getItem("checkin_state"); if(s){ try{ const j = JSON.parse(s); state.streak=j.streak||0; state.lastCheckin=j.lastCheckin||null; }catch{}} if(state.address){ els.bscAddress.value = state.address; } }
  function saveCheckin(){ localStorage.setItem("checkin_state", JSON.stringify({ streak:state.streak, lastCheckin:state.lastCheckin })); }
  function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  const canCheckinToday = () => state.lastCheckin !== todayStr();

  function renderCheckinGrid(){ els.checkinGrid.querySelectorAll("li").forEach((li,idx)=>{ li.style.setProperty("--start", `${idx*40}deg`); const day=Number(li.dataset.day); li.classList.toggle("active", day <= state.streak); li.classList.toggle("checked", day <= state.streak); }); els.streakInfo.innerHTML = `Streak: <strong>${state.streak}</strong> hari`; els.btnCheckin.disabled = !canCheckinToday(); els.btnCheckin.textContent = canCheckinToday() ? "Check-in Hari Ini" : "Sudah Check-in"; }

  async function handleCheckin(){ if(!canCheckinToday()) return; state.lastCheckin = todayStr(); state.streak = Math.min(7,(state.streak||0)+1); saveCheckin(); renderCheckinGrid(); toast("Check-in berhasil!"); }

  function setScreen(name){ Object.entries(els.screens).forEach(([k,el])=>el.classList.toggle("active", k===name)); els.tabs.forEach(tab=>tab.classList.toggle("active", tab.dataset.target===name)); }
  function initTabs(){ els.tabs.forEach(tab=>tab.addEventListener("click", ()=>setScreen(tab.dataset.target))); }

  function setProfile(){ const u=state.user; const name = u ? [u.first_name,u.last_name].filter(Boolean).join(" ") : "Guest"; const username = u?.username ? `@${u.username}` : (u ? `id:${u.id}` : "@guest"); els.profileName.textContent=name; els.profileUsername.textContent=username; const photo=u?.photo_url; if(photo){ const img=new Image(); img.src=photo; img.alt="Avatar"; els.profileAvatar.innerHTML=""; els.profileAvatar.appendChild(img);} else { const initials = name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); els.profileAvatar.innerHTML = `<div style="display:grid;place-items:center;width:100%;height:100%;color:#fff;font-weight:800;">${initials}</div>`; } }

  function setReferralLink(){ const id = state.user?.id || "guest"; const link = `https://t.me/${window.BOT_USERNAME}?start=ref_${id}`; els.refLink.value = link; }

  function copy(text){ try{ navigator.clipboard.writeText(text); toast("Copied!"); } catch{ const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Copied!"); } }
  function initReferralButtons(){ els.btnCopyRef.addEventListener("click",()=>copy(els.refLink.value)); els.btnShareRef.addEventListener("click",()=>{ const url=els.refLink.value; const text="Join Watch2EarnReall dan dapatkan reward nonton iklan!"; if(navigator.share){ navigator.share({ title:"Watch2EarnReall", text, url }).catch(()=>{});} else copy(url); }); }

  function toast(msg){ if(tg?.showPopup){ tg.showPopup({ title:"Info", message:msg, buttons:[{id:"ok", type:"default", text:"OK"}] }); } else { console.log("[Toast]", msg); } }

  function showModal({ title, message, onOk, onCancel }){ els.modalTitle.textContent=title||"Konfirmasi"; els.modalMsg.textContent=message||""; els.modalBackdrop.hidden=false; const ok=()=>{ cleanup(); onOk&&onOk(); }, cancel=()=>{ cleanup(); onCancel&&onCancel(); }; const cleanup=()=>{ els.modalBackdrop.hidden=true; els.modalOk.removeEventListener("click", ok); els.modalCancel.removeEventListener("click", cancel); }; els.modalOk.addEventListener("click", ok); els.modalCancel.addEventListener("click", cancel); }

  function showMonetagAd(){ const fn = window[window.MONETAG_FN]; try{ if(typeof fn==="function") fn(); }catch{} return new Promise(resolve=>showModal({ title:"Iklan", message:"Tonton iklan sampai selesai lalu tekan Selesai. Sistem akan verifikasi reward dari server.", onOk:()=>resolve(true), onCancel:()=>resolve(false) })); }

  async function completeTask(taskId){ try{ const res = await call("/api/reward/complete", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ user_id: state.user?.id, task_id: taskId, initData: tg?.initData || "" }) }); const data = await res.json(); if(data?.credited){ state.tasks[taskId].completed=true; setBalance(state.balance + (state.tasks[taskId].reward||0)); document.querySelector(`[data-task-id="${taskId}"] [data-action="watch"]`).disabled = true; toast("Reward ditambahkan!"); } else { toast("Verifikasi gagal."); } } catch { toast("Gagal konek server."); } }

  function initTasks(){ document.querySelectorAll(".task-card .btn-cta[data-action='watch']").forEach(btn=>{ btn.addEventListener("click", async ()=>{ const taskId = btn.closest(".task-card").dataset.taskId; if(state.tasks[taskId]?.completed) return; const watched = await showMonetagAd(); if(watched) await completeTask(taskId); }); }); }

  function initWithdrawForm(){ els.withdrawForm.addEventListener("submit", async (e)=>{ e.preventDefault(); const amount = Number(els.withdrawAmount.value); if(isNaN(amount) || amount < 1) return toast("Minimum withdraw 1$"); if(!state.address) return toast("Isi alamat BEP20 dulu."); try{ const res = await call("/api/withdraw", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ user_id: state.user?.id, amount, address: state.address }) }); const data = await res.json(); if(data?.ok){ toast("Permintaan withdraw dikirim."); els.withdrawAmount.value=""; } else { toast(data?.error || "Gagal withdraw."); } } catch { toast("Gagal konek server."); } }); }

  function initAddressForm(){ els.addressForm.addEventListener("submit", async (e)=>{ e.preventDefault(); const addr=(els.bscAddress.value||"").trim(); if(!/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast("Alamat BEP20 tidak valid."); state.address=addr; localStorage.setItem("bsc_address", addr); try{ await call("/api/address/save", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ user_id: state.user?.id, address: addr }) }); toast("Alamat disimpan."); } catch { toast("Gagal menyimpan alamat (server)."); } }); }

  async function fetchReferrals(){ try{ const res = await call(`/api/referrals?user_id=${encodeURIComponent(state.user?.id || "guest")}`); const data = await res.json(); els.refCount.textContent = data?.count ?? 0; els.refBonus.textContent = `$${(Number(data?.bonus||0)).toFixed(2)}`; const list = Array.isArray(data?.list) ? data.list : []; els.refList.innerHTML = list.map(r => `<div class="ref-item"><div class="avatar"></div><div>${r?.name || "User"}<br><small>${r?.joined || ""}</small></div></div>`).join(""); } catch {} }

  function init(){ loadPersisted(); setProfile(); setReferralLink(); setBalance(state.balance); renderCheckinGrid(); initTabs(); initReferralButtons(); initTasks(); initWithdrawForm(); initAddressForm(); els.btnCheckin.addEventListener("click", handleCheckin); fetchReferrals(); document.body.dataset.tg = tg?.colorScheme || "light"; }
  init();
})();