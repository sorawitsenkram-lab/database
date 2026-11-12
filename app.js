const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const todayStr=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const thDate=s=>s?new Date(s+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}):"";
const thTime=t=>new Date(t).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function toast(m){const t=$("toast");t.textContent=m;t.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display="none",2800)}
// ---- เชื่อมต่อฐานข้อมูล Supabase (ตั้งค่าใน config.js) ----
let teamKey="";try{teamKey=localStorage.getItem("teamKey")||""}catch(e){}
async function rpc(fn,body){
  const C=window.CONFIG||{};
  if(!C.SUPABASE_URL||C.SUPABASE_URL.includes("xxxx")) throw new Error("ยังไม่ได้ตั้งค่า config.js");
  if(!teamKey){teamKey=(prompt("ใส่รหัสทีม")||"").trim();try{localStorage.setItem("teamKey",teamKey)}catch(e){}}
  const headers={"Content-Type":"application/json",apikey:C.SUPABASE_ANON_KEY};
  if(String(C.SUPABASE_ANON_KEY).startsWith("eyJ")) headers.Authorization="Bearer "+C.SUPABASE_ANON_KEY;
  const r=await fetch(C.SUPABASE_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers,body:JSON.stringify({p_key:teamKey,...body})});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(!r.ok){
    const m=(j&&j.message)||"เกิดข้อผิดพลาด ลองใหม่";
    if(m.includes("รหัสทีม")){teamKey="";try{localStorage.removeItem("teamKey")}catch(e){}}
    throw new Error(m);
  }
  return j;
}
const API={
  getAll:()=>rpc("get_all",{}),
  checkPin:p=>rpc("check_pin",{p_pin:p}),
  addCase:(d,by)=>rpc("add_case",{p_data:d,p_by:by||null}),
  updateCase:(id,d,by,name)=>rpc("update_case",{p_id:id,p_data:d,p_by:by||null,p_by_name:name}),
  addLog:(id,text,by,name)=>rpc("add_log",{p_case:id,p_body:text,p_by:by||null,p_by_name:name}),
  deleteCase:id=>rpc("delete_case",{p_id:id}),
  addStaff:(name,pin)=>rpc("add_staff",{p_pin:pin,p_name:name}),
  removeStaff:(id,pin)=>rpc("remove_staff",{p_pin:pin,p_id:id})
};
const api=(fn,...a)=>API[fn](...a);

let staff=[],cases=[],logs=[],editing=null,drafts={},adminPin="";
let meId="";try{meId=localStorage.getItem("meId")||""}catch(e){}
const staffName=id=>(staff.find(s=>s.id===id)||{}).name||"(ไม่ระบุ)";
const myName=()=>meId?staffName(meId):"ไม่ระบุชื่อ";

async function refresh(){
  try{const d=await api("getAll");staff=d.staff;cases=d.cases;logs=d.logs;
    if(meId&&!staff.some(x=>x.id===meId))meId="";
    fillStaffSelects();renderStaff();render();
  }catch(e){console.error(e);toast((e&&e.message)||"โหลดข้อมูลไม่ได้ ลองกดรีเฟรช")}
}
async function guard(fn){try{await fn();await refresh()}catch(e){console.error(e);toast((e&&e.message)||"บันทึกไม่ได้ ลองใหม่")}}

function fillStaffSelects(){
  const opts=staff.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  $("me").innerHTML=`<option value="">— เลือกชื่อ —</option>`+opts;$("me").value=meId;
  const fo=$("fowner"),v=fo.value;fo.innerHTML=`<option value="">ทุกคน</option>`+opts;fo.value=v;
  const o=$("fOwner"),ov=o.value;o.innerHTML=opts;if(ov)o.value=ov;
}

function render(){
  const q=$("q").value.trim().toLowerCase(),fd=$("fdate").value,fo=$("fowner").value,fs=$("fstatus").value;
  const byCase={};logs.forEach(l=>(byCase[l.caseId]=byCase[l.caseId]||[]).push(l));
  Object.values(byCase).forEach(a=>a.sort((x,y)=>x.at-y.at));
  const rows=cases.filter(c=>{
    if(fd&&c.date!==fd)return false;
    if(fo&&c.owner!==fo)return false;
    if(fs&&c.status!==fs)return false;
    if(q){const hay=[c.title,c.caseNo,c.detail,staffName(c.owner),...(byCase[c.id]||[]).map(l=>l.text+" "+l.byName)].join(" ").toLowerCase();if(!hay.includes(q))return false}
    return true}).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
  $("count").textContent=rows.length+" เคส";
  const ae=document.activeElement,keep=ae&&ae.dataset&&ae.dataset.draft;
  $("list").innerHTML=rows.length?rows.map(c=>{
    const ls=byCase[c.id]||[],sc=c.status==="เสร็จสิ้น"?"s-done":c.status==="รอส่งต่อ"?"s-wait":"s-doing";
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h3>${esc(c.title)}</h3>
        <div class="meta">${c.caseNo?`<span>#${esc(c.caseNo)}</span>`:""}<span>📅 ${thDate(c.date)}</span><span class="chip">👤 ${esc(staffName(c.owner))}</span><span class="chip ${sc}">${esc(c.status)}</span></div></div>
        <button class="btn ghost" data-edit="${esc(c.id)}">แก้ไข</button>
      </div>
      ${c.detail?`<div class="detail">${esc(c.detail)}</div>`:""}
      ${ls.length?`<div class="logs">${ls.map(l=>`<div class="log">${esc(l.text)} <small>— ${esc(l.byName)} · ${thTime(l.at)}</small></div>`).join("")}</div>`:""}
      <div class="upd"><input data-draft="${esc(c.id)}" placeholder="อัพเดท / รับช่วงต่อ: เขียนว่าทำอะไรไปแล้ว" value="${esc(drafts[c.id]||"")}"><button class="btn" data-upd="${esc(c.id)}">เพิ่มอัพเดท</button></div>
    </div>`}).join(""):`<div class="empty">ยังไม่มีเคสตามเงื่อนไขนี้</div>`;
  if(keep){const el=document.querySelector(`[data-draft="${keep}"]`);if(el){el.focus();const n=el.value.length;el.setSelectionRange(n,n)}}
}

function renderStaff(){
  $("staffList").innerHTML=staff.length?staff.map(s=>`<div class="card row" style="justify-content:space-between;padding:10px 14px"><span>👤 ${esc(s.name)}</span><button class="btn danger" data-rm="${esc(s.id)}">ลบ</button></div>`).join(""):`<div class="empty">ยังไม่มีรายชื่อ เพิ่มชื่อด้านบนได้เลย</div>`;
}

function openDlg(c){
  editing=c||null;
  $("dlgTitle").textContent=c?"แก้ไขเคส":"เพิ่มเคสใหม่";
  $("fNo").value=c?c.caseNo||"":"";$("fTitle").value=c?c.title:"";$("fDetail").value=c?c.detail||"":"";
  $("fDate").value=c?c.date:todayStr();$("fStatus").value=c?c.status:"กำลังดำเนินการ";
  fillStaffSelects();$("fOwner").value=c?c.owner:(meId||(staff[0]&&staff[0].id)||"");
  $("del").style.display=c?"":"none";$("dlg").showModal();
}

async function saveCase(){
  const title=$("fTitle").value.trim();if(!title){toast("กรุณาใส่ชื่อเคส");return}
  const data={caseNo:$("fNo").value.trim(),title,detail:$("fDetail").value.trim(),date:$("fDate").value||todayStr(),status:$("fStatus").value,owner:$("fOwner").value};
  $("save").disabled=true;
  await guard(async()=>{
    if(editing)await api("updateCase",editing.id,data,meId,myName());
    else await api("addCase",data,meId);
    $("dlg").close();toast("บันทึกแล้ว");
  });
  $("save").disabled=false;
}

document.addEventListener("click",async e=>{
  const t=e.target.closest("button");if(!t)return;
  if(t.dataset.t){
    if(t.dataset.t==="admin"&&!adminPin){
      const p=prompt("ใส่ PIN หลังบ้าน");if(!p)return;
      try{if(!(await api("checkPin",p))){toast("PIN ไม่ถูกต้อง");return}adminPin=p}catch(x){toast("ตรวจ PIN ไม่ได้");return}
    }
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b===t));
    $("casesView").hidden=t.dataset.t!=="cases";$("adminView").hidden=t.dataset.t!=="admin";
  }
  if(t.dataset.edit)openDlg(cases.find(c=>c.id===t.dataset.edit));
  if(t.dataset.upd){const id=t.dataset.upd,inp=document.querySelector(`[data-draft="${id}"]`),v=inp.value.trim();if(!v)return;
    t.disabled=true;await guard(async()=>{await api("addLog",id,v,meId,myName());drafts[id]="";toast("เพิ่มอัพเดทแล้ว")});t.disabled=false}
  if(t.dataset.rm){const s=staff.find(x=>x.id===t.dataset.rm);if(s&&confirm("ลบ "+s.name+" ออกจากรายชื่อ?"))guard(()=>api("removeStaff",s.id,adminPin))}
});
document.addEventListener("input",e=>{if(e.target.dataset&&e.target.dataset.draft)drafts[e.target.dataset.draft]=e.target.value});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.dataset&&e.target.dataset.draft){const b=document.querySelector(`[data-upd="${e.target.dataset.draft}"]`);b&&b.click()}});
["q","fdate","fowner","fstatus"].forEach(i=>$(i).addEventListener("input",render));
$("today").onclick=()=>{$("fdate").value=todayStr();render()};
$("all").onclick=()=>{$("fdate").value="";render()};
$("reload").onclick=()=>{refresh().then(()=>toast("อัพเดทข้อมูลล่าสุดแล้ว"))};
$("add").onclick=()=>openDlg(null);
$("cancel").onclick=()=>$("dlg").close();
$("save").onclick=saveCase;
$("del").onclick=()=>{if(editing&&confirm("ลบเคสนี้ถาวร?"))guard(async()=>{await api("deleteCase",editing.id);$("dlg").close();toast("ลบแล้ว")})};
$("me").onchange=e=>{meId=e.target.value;try{localStorage.setItem("meId",meId)}catch(x){}};
$("addStaff").onclick=()=>{const n=$("newName").value.trim();if(!n)return;guard(async()=>{await api("addStaff",n,adminPin);$("newName").value="";toast("เพิ่มชื่อแล้ว")})};
$("newName").addEventListener("keydown",e=>{if(e.key==="Enter")$("addStaff").click()});

refresh();
setInterval(()=>{if(teamKey&&!document.hidden&&!$("dlg").open)refresh()},15000);
