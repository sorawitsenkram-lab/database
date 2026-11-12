const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const todayStr=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const thDate=s=>s?new Date(s+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}):"";
const thTime=t=>new Date(t).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function toast(m){const t=$("toast");t.textContent=m;t.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display="none",2800)}
// ---- ฐานข้อมูล = ไฟล์ data/data.json ใน GitHub repo (อ่าน/เขียนผ่าน GitHub API) ----
// ★ ตั้งค่าอยู่ในไฟล์นี้เลย ไม่ต้องพึ่ง config.js อีกต่อไป
const CONFIG={
  OWNER:"sorawitsenkram-lab",   // ชื่อผู้ใช้ GitHub
  REPO:"database",              // ชื่อ repo ที่เก็บไฟล์ข้อมูล
  BRANCH:"main",
  PATH:"data.json",             // ไฟล์ข้อมูลอยู่ที่ root ของ repo
  ADMIN_PIN_SHA256:"03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4" // PIN เริ่มต้น 1234
};
const C=CONFIG;
let token="";try{token=localStorage.getItem("ghToken")||""}catch(e){}
let sha=null,etag=null,cache=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uid=()=>(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)+Date.now()).replace(/-/g,"").slice(0,10);
const b64dec=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g,"")),c=>c.charCodeAt(0)));
const b64enc=s=>{let b="";new TextEncoder().encode(s).forEach(x=>b+=String.fromCharCode(x));return btoa(b)};
const fileUrl=()=>`https://api.github.com/repos/${C.OWNER}/${C.REPO}/contents/${C.PATH}`;
function ensureToken(){
  if(!C.OWNER||!C.REPO) throw new Error("ยังไม่ได้ใส่ OWNER/REPO ที่ต้นไฟล์ app.js");
  if(!token){token=(prompt("วาง GitHub Token ของทีม (ขอจากผู้ดูแล)")||"").trim();try{localStorage.setItem("ghToken",token)}catch(e){}}
  if(!token) throw new Error("ต้องใส่ GitHub Token ก่อนใช้งาน");
}
const hdr=()=>({Accept:"application/vnd.github+json",Authorization:"Bearer "+token});
async function ghError(r){
  let m="";try{m=(await r.json()).message||""}catch(e){}
  if(r.status===401){token="";try{localStorage.removeItem("ghToken")}catch(e){}return new Error("Token ไม่ถูกต้องหรือหมดอายุ ลองรีเฟรชแล้วใส่ใหม่")}
  if(r.status===403||r.status===429)return new Error("ไม่มีสิทธิ์ หรือเรียกถี่เกินไป (ตรวจว่า Token มีสิทธิ์ Contents: Read and write) "+m);
  if(r.status===404)return new Error("ไม่พบ repo/ไฟล์ข้อมูล หรือ Token ไม่มีสิทธิ์เข้าถึง repo นี้");
  return new Error(m||"เกิดข้อผิดพลาดกับ GitHub ("+r.status+")");
}
const norm=d=>({staff:d.staff||[],cases:d.cases||[],logs:d.logs||[]});
async function load(force){
  ensureToken();
  const h=hdr();if(etag&&!force)h["If-None-Match"]=etag;
  const r=await fetch(fileUrl()+"?ref="+encodeURIComponent(C.BRANCH||"main"),{headers:h,cache:"no-store"});
  if(r.status===304&&cache)return cache;
  if(r.status===404){
    const rr=await fetch(`https://api.github.com/repos/${C.OWNER}/${C.REPO}`,{headers:hdr(),cache:"no-store"});
    if(!rr.ok)throw await ghError(rr);
    sha=null;etag=null;cache=norm({});return cache;          // repo มีอยู่ แต่ยังไม่มีไฟล์ข้อมูล: เริ่มจากว่าง
  }
  if(!r.ok)throw await ghError(r);
  const j=await r.json();sha=j.sha;etag=r.headers.get("ETag");
  cache=norm(JSON.parse(b64dec(j.content)||"{}"));return cache;
}
// อ่านข้อมูลล่าสุด -> แก้ -> บันทึก (ถ้าชนกับคนอื่นจะอ่านใหม่แล้วทำซ้ำให้อัตโนมัติ)
async function mutate(fn,msg){
  for(let i=0;i<5;i++){
    const d=JSON.parse(JSON.stringify(await load(true)));
    const out=fn(d);
    const body={message:msg,content:b64enc(JSON.stringify(d,null,1)),branch:C.BRANCH||"main"};if(sha)body.sha=sha;
    const r=await fetch(fileUrl(),{method:"PUT",headers:{...hdr(),"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(r.ok){const j=await r.json();sha=j.content.sha;cache=d;etag=null;return out}
    if(r.status===409||r.status===422){await sleep(400*(i+1));continue}
    throw await ghError(r);
  }
  throw new Error("มีคนบันทึกพร้อมกันหลายคน ลองใหม่อีกครั้ง");
}
async function sha256(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function pinOk(p){return (await sha256(String(p)))===C.ADMIN_PIN_SHA256}
const nameOf=(d,id)=>(d.staff.find(s=>s.id===id)||{}).name||"(ไม่ระบุ)";
const API={
  getAll:async()=>{const d=await load(false);return JSON.parse(JSON.stringify(d))},
  checkPin:p=>pinOk(p),
  addCase:(d,by)=>mutate(db=>{const id=uid();db.cases.push({id,caseNo:d.caseNo||"",title:d.title,detail:d.detail||"",date:d.date,status:d.status,owner:d.owner||null,members:(d.members||[]).filter(x=>x!==d.owner),createdAt:Date.now(),createdBy:by||""});return id},"เพิ่มเคส: "+d.title),
  updateCase:(id,d,by,name)=>mutate(db=>{
    const c=db.cases.find(x=>x.id===id);if(!c)throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    const oo=c.owner,os=c.status,om=c.members||[];
    const nm=(d.members||[]).filter(x=>x!==(d.owner||null));
    Object.assign(c,{caseNo:d.caseNo||"",title:d.title,detail:d.detail||"",date:d.date,status:d.status,owner:d.owner||null,members:nm});
    const notes=[];
    if((oo||null)!==(c.owner||null))notes.push("ส่งต่อเคสจาก "+nameOf(db,oo)+" ไปยัง "+nameOf(db,c.owner));
    else if(os!==c.status)notes.push("เปลี่ยนสถานะเป็น "+c.status);
    const added=nm.filter(x=>!om.includes(x)),removed=om.filter(x=>!nm.includes(x));
    if(added.length)notes.push("เพิ่มผู้ร่วมเคส: "+added.map(x=>nameOf(db,x)).join(", "));
    if(removed.length)notes.push("นำออกจากเคส: "+removed.map(x=>nameOf(db,x)).join(", "));
    notes.forEach(n=>db.logs.push({id:uid(),caseId:id,text:n,by:by||"",byName:name||"ไม่ระบุชื่อ",at:Date.now()}));
  },"แก้ไขเคส: "+d.title),
  toggleJoin:(id,sid,name)=>mutate(db=>{
    const c=db.cases.find(x=>x.id===id);if(!c)throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    if(c.owner===sid)throw new Error("คุณเป็นผู้รับผิดชอบหลักของเคสนี้อยู่แล้ว");
    c.members=c.members||[];
    const had=c.members.includes(sid);
    c.members=had?c.members.filter(x=>x!==sid):[...c.members,sid];
    db.logs.push({id:uid(),caseId:id,text:nameOf(db,sid)+(had?" ออกจากเคส":" เข้าร่วมเคส"),by:sid,byName:name||"ไม่ระบุชื่อ",at:Date.now()});
  },"เข้า/ออกจากเคส"),
  addLog:(id,text,by,name)=>mutate(db=>{
    if(!db.cases.some(x=>x.id===id))throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    db.logs.push({id:uid(),caseId:id,text,by:by||"",byName:name||"ไม่ระบุชื่อ",at:Date.now()});
  },"อัพเดทเคส"),
  deleteCase:id=>mutate(db=>{db.cases=db.cases.filter(x=>x.id!==id);db.logs=db.logs.filter(x=>x.caseId!==id)},"ลบเคส"),
  addStaff:async(name,pin)=>{if(!(await pinOk(pin)))throw new Error("PIN ไม่ถูกต้อง");return mutate(db=>{db.staff.push({id:uid(),name:String(name).trim(),at:Date.now()})},"เพิ่มรายชื่อ: "+name)},
  removeStaff:async(id,pin)=>{if(!(await pinOk(pin)))throw new Error("PIN ไม่ถูกต้อง");return mutate(db=>{db.staff=db.staff.filter(x=>x.id!==id)},"ลบรายชื่อ")}
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

const mem=c=>(c.members||[]).filter(id=>staff.some(s=>s.id===id));
const joinBtn=c=>c.owner&&c.owner===meId?"":`<button class="btn ghost" data-join="${esc(c.id)}">${(c.members||[]).includes(meId)?"ออกจากเคส":"+ เข้าร่วมเคส"}</button>`;
function renderMembers(sel){$("fMembers").innerHTML=staff.length?staff.map(s=>`<label class="chk"><input type="checkbox" value="${esc(s.id)}" ${sel.includes(s.id)?"checked":""}> ${esc(s.name)}</label>`).join(""):`<span class="meta">ยังไม่มีรายชื่อ เพิ่มที่หลังบ้านก่อน</span>`}
function syncMembers(){const o=$("fOwner").value;document.querySelectorAll("#fMembers input").forEach(i=>{if(i.value===o){i.checked=false;i.disabled=true}else i.disabled=false})}
const getMembers=()=>[...document.querySelectorAll("#fMembers input:checked")].map(i=>i.value).filter(v=>v!==$("fOwner").value);
function render(){
  const q=$("q").value.trim().toLowerCase(),fd=$("fdate").value,fo=$("fowner").value,fs=$("fstatus").value;
  const byCase={};logs.forEach(l=>(byCase[l.caseId]=byCase[l.caseId]||[]).push(l));
  Object.values(byCase).forEach(a=>a.sort((x,y)=>x.at-y.at));
  const rows=cases.filter(c=>{
    if(fd&&c.date!==fd)return false;
    if(fo&&c.owner!==fo&&!(c.members||[]).includes(fo))return false;
    if(fs&&c.status!==fs)return false;
    if(q){const hay=[c.title,c.caseNo,c.detail,staffName(c.owner),...(c.members||[]).map(staffName),...(byCase[c.id]||[]).map(l=>l.text+" "+l.byName)].join(" ").toLowerCase();if(!hay.includes(q))return false}
    return true}).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
  $("count").textContent=rows.length+" เคส";
  const ae=document.activeElement,keep=ae&&ae.dataset&&ae.dataset.draft;
  $("list").innerHTML=rows.length?rows.map(c=>{
    const ls=byCase[c.id]||[],sc=c.status==="เสร็จสิ้น"?"s-done":c.status==="รอส่งต่อ"?"s-wait":"s-doing";
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h3>${esc(c.title)}</h3>
        <div class="meta">${c.caseNo?`<span>#${esc(c.caseNo)}</span>`:""}<span>📅 ${thDate(c.date)}</span><span class="chip">👤 ${esc(staffName(c.owner))}</span>${mem(c).map(id=>`<span class="chip">👥 ${esc(staffName(id))}</span>`).join("")}<span class="chip ${sc}">${esc(c.status)}</span></div></div>
        <span class="row" style="gap:6px">${joinBtn(c)}<button class="btn ghost" data-edit="${esc(c.id)}">แก้ไข</button></span>
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
  fillStaffSelects();$("fOwner").value=c?c.owner:(meId||(staff[0]&&staff[0].id)||"");renderMembers(c?mem(c):[]);syncMembers();
  $("del").style.display=c?"":"none";$("dlg").showModal();
}

async function saveCase(){
  const title=$("fTitle").value.trim();if(!title){toast("กรุณาใส่ชื่อเคส");return}
  const data={caseNo:$("fNo").value.trim(),title,detail:$("fDetail").value.trim(),date:$("fDate").value||todayStr(),status:$("fStatus").value,owner:$("fOwner").value,members:getMembers()};
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
  if(t.dataset.join){if(!meId){toast("เลือกชื่อ \"ฉันคือ\" มุมขวาบนก่อน");return}
    t.disabled=true;await guard(async()=>{await api("toggleJoin",t.dataset.join,meId,myName());toast("อัพเดทผู้ร่วมเคสแล้ว")});t.disabled=false}
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
$("fOwner").addEventListener("change",syncMembers);
$("cancel").onclick=()=>$("dlg").close();
$("save").onclick=saveCase;
$("del").onclick=()=>{if(editing&&confirm("ลบเคสนี้ถาวร?"))guard(async()=>{await api("deleteCase",editing.id);$("dlg").close();toast("ลบแล้ว")})};
$("me").onchange=e=>{meId=e.target.value;try{localStorage.setItem("meId",meId)}catch(x){}};
$("addStaff").onclick=()=>{const n=$("newName").value.trim();if(!n)return;guard(async()=>{await api("addStaff",n,adminPin);$("newName").value="";toast("เพิ่มชื่อแล้ว")})};
$("newName").addEventListener("keydown",e=>{if(e.key==="Enter")$("addStaff").click()});

refresh();
setInterval(()=>{if(token&&!document.hidden&&!$("dlg").open)refresh()},15000);
