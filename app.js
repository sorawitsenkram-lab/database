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
const norm=d=>({staff:d.staff||[],cases:d.cases||[],logs:d.logs||[],properties:d.properties||[]});
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
// ---- ไฟล์รูป: เก็บเป็นไฟล์ใน repo (โฟลเดอร์ photos/) อ่าน/เขียนผ่าน GitHub API ----
const pathUrl=p=>`https://api.github.com/repos/${C.OWNER}/${C.REPO}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;
async function putFile(path,b64){
  ensureToken();
  const r=await fetch(pathUrl(path),{method:"PUT",headers:{...hdr(),"Content-Type":"application/json"},body:JSON.stringify({message:"แนบรูป",content:b64,branch:C.BRANCH||"main"})});
  if(!r.ok)throw await ghError(r);
}
async function ghDeleteFile(path){
  ensureToken();
  const g=await fetch(pathUrl(path)+"?ref="+encodeURIComponent(C.BRANCH||"main"),{headers:hdr(),cache:"no-store"});
  if(g.status===404)return;
  if(!g.ok)throw await ghError(g);
  const meta=await g.json();
  const r=await fetch(pathUrl(path),{method:"DELETE",headers:{...hdr(),"Content-Type":"application/json"},body:JSON.stringify({message:"ลบรูป",sha:meta.sha,branch:C.BRANCH||"main"})});
  if(!r.ok)throw await ghError(r);
}
const photoSrc=new Map(),photoPend=new Map();
function photoUrl(p){
  if(photoSrc.has(p))return Promise.resolve(photoSrc.get(p));
  if(photoPend.has(p))return photoPend.get(p);
  const pr=(async()=>{
    ensureToken();
    const r=await fetch(pathUrl(p)+"?ref="+encodeURIComponent(C.BRANCH||"main"),{headers:{...hdr(),Accept:"application/vnd.github.raw+json"}});
    if(!r.ok)throw await ghError(r);
    const u=URL.createObjectURL(new Blob([await r.arrayBuffer()],{type:"image/jpeg"}));
    photoSrc.set(p,u);return u;
  })();
  photoPend.set(p,pr);pr.finally(()=>photoPend.delete(p)).catch(()=>{});return pr;
}
function compressImage(file,max=1280,q=.78){
  return new Promise((res,rej)=>{
    const img=new Image(),u=URL.createObjectURL(file);
    img.onload=()=>{
      const k=Math.min(1,max/Math.max(img.width,img.height)),w=Math.round(img.width*k),h=Math.round(img.height*k);
      const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(u);c.toBlob(b=>b?res(b):rej(new Error("แปลงรูปไม่ได้")),"image/jpeg",q);
    };
    img.onerror=()=>{URL.revokeObjectURL(u);rej(new Error("เปิดรูปไม่ได้ (ใช้ไฟล์ JPG/PNG/WebP)"))};
    img.src=u;
  });
}
const blobB64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=()=>rej(new Error("อ่านรูปไม่ได้"));r.readAsDataURL(b)});
async function needPin(p){if(!(await pinOk(p)))throw new Error("PIN ไม่ถูกต้อง")}
const nameOf=(d,id)=>(d.staff.find(s=>s.id===id)||{}).name||"(ไม่ระบุ)";
const API={
  getAll:async()=>{const d=await load(false);return JSON.parse(JSON.stringify(d))},
  checkPin:p=>pinOk(p),
  addCase:(d,by)=>mutate(db=>{const id=uid();db.cases.push({id,caseNo:d.caseNo||"",title:d.title,detail:d.detail||"",date:d.date,status:d.status,owner:d.owner||null,category:d.category||"",location:d.location||"",zone:d.zone||"",marsha:d.marsha||"",photos:d.photos||[],members:(d.members||[]).filter(x=>x!==d.owner),createdAt:Date.now(),createdBy:by||""});return id},"เพิ่มเคส: "+d.title),
  updateCase:(id,d,by,name)=>mutate(db=>{
    const c=db.cases.find(x=>x.id===id);if(!c)throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    const oo=c.owner,os=c.status,om=c.members||[],omar=c.marsha||"";
    const nm=(d.members||[]).filter(x=>x!==(d.owner||null));
    Object.assign(c,{caseNo:d.caseNo||"",title:d.title,detail:d.detail||"",date:d.date,status:d.status,owner:d.owner||null,category:d.category||"",location:d.location||"",zone:d.zone||"",marsha:d.marsha||"",photos:d.photos||[],members:nm});
    const notes=[];
    if(omar!==(c.marsha||""))notes.push("เปลี่ยน MARSHA เป็น "+(c.marsha||"ไม่ระบุ"));
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
  addStaff:async(name,pin,zone)=>{await needPin(pin);return mutate(db=>{db.staff.push({id:uid(),name:String(name).trim(),zone:zone||"",at:Date.now()})},"เพิ่มรายชื่อ: "+name)},
  setStaffZone:async(id,zone,pin)=>{await needPin(pin);return mutate(db=>{const x=db.staff.find(v=>v.id===id);if(x)x.zone=zone||""},"ย้ายโซนสมาชิก")},
  removeStaff:async(id,pin)=>{await needPin(pin);return mutate(db=>{db.staff=db.staff.filter(x=>x.id!==id)},"ลบรายชื่อ")},
  addProperty:async(code,name,zone,pin)=>{await needPin(pin);return mutate(db=>{
    if(db.properties.some(p=>p.code===code))throw new Error("มี MARSHA code "+code+" อยู่แล้ว");
    db.properties.push({id:uid(),code,name:name||"",zone:zone||"1",at:Date.now()});
  },"เพิ่ม MARSHA: "+code)},
  setPropertyZone:async(id,zone,pin)=>{await needPin(pin);return mutate(db=>{const x=db.properties.find(v=>v.id===id);if(x)x.zone=zone||"1"},"ย้ายโซน MARSHA")},
  removeProperty:async(id,pin)=>{await needPin(pin);return mutate(db=>{db.properties=db.properties.filter(x=>x.id!==id)},"ลบ MARSHA")}
};
const api=(fn,...a)=>API[fn](...a);

const ZONES=["1","2","3","4"];
const MAXPH=6;
let staff=[],cases=[],logs=[],props=[],editing=null,drafts={},adminPin="",lastSig="",existing=[],pending=[];
let meId="";try{meId=localStorage.getItem("meId")||""}catch(e){}
const lsGet=k=>{try{return localStorage.getItem(k)||""}catch(e){return ""}};
const staffById=id=>staff.find(s=>s.id===id)||null;
const staffName=id=>(staffById(id)||{}).name||"(ไม่ระบุ)";
const staffZone=id=>(staffById(id)||{}).zone||"";
const myName=()=>meId?staffName(meId):"ไม่ระบุชื่อ";
const zoneOpts=(sel,blank)=>(blank?`<option value="">${blank}</option>`:"")+ZONES.map(z=>`<option value="${z}"${z===sel?" selected":""}>Zone ${z}</option>`).join("");
const propOf=code=>props.find(p=>p.code===code)||null;

async function refresh(force){
  try{
    const d=await api("getAll");
    const sig=JSON.stringify([d.staff,d.cases,d.logs,d.properties]);
    if(sig===lastSig&&!force)return;
    lastSig=sig;staff=d.staff;cases=d.cases;logs=d.logs;props=d.properties||[];
    if(meId&&!staff.some(x=>x.id===meId))meId="";
    fillStaffSelects();renderAdmin();render();
  }catch(e){console.error(e);toast((e&&e.message)||"โหลดข้อมูลไม่ได้ ลองกดรีเฟรช")}
}
async function guard(fn){try{await fn();await refresh()}catch(e){console.error(e);toast((e&&e.message)||"บันทึกไม่ได้ ลองใหม่")}}

function fillStaffSelects(){
  const lab=s=>esc(s.name)+(s.zone?" · Z"+esc(s.zone):"");
  const opts=staff.map(s=>`<option value="${esc(s.id)}">${lab(s)}</option>`).join("");
  $("me").innerHTML=`<option value="">— เลือกชื่อ —</option>`+opts;$("me").value=meId;
  const fo=$("fowner"),v=fo.value;fo.innerHTML=`<option value="">ทุกคน</option>`+opts;fo.value=v;
  const o=$("fOwner"),ov=o.value;o.innerHTML=opts;if(ov)o.value=ov;
}

const mem=c=>(c.members||[]).filter(id=>staff.some(s=>s.id===id));
const CAT={"Network":"🌐","Server":"🖥️","POS/PMS":"🧾","CCTV":"📹","Wi-Fi":"📶","PC/Hardware":"💻","Software":"🧩","Printer":"🖨️","Phone/PBX":"☎️","Email/Account":"📧","อื่นๆ":"🛠️"};
const STC=v=>v==="เสร็จสิ้น"?"done":v==="รอส่งต่อ"?"wait":"doing";
const ini=n=>{const t=String(n||"?").trim().replace(/^[เแโใไ]/,"");return ([...t][0]||"?").toUpperCase()};
const hue=x=>{let h=0;for(const ch of String(x))h=(h*31+ch.charCodeAt(0))%360;return h};
const avatar=(id,main)=>{const ok=staff.some(s=>s.id===id);return `<span class="av${main?" main":""}" style="--h:${hue(id)}" title="${esc(staffName(id))}${main?" (ผู้รับผิดชอบหลัก)":""}">${ok?esc(ini(staffName(id))):"?"}</span>`};
const joinBtn=c=>c.owner&&c.owner===meId?"":`<button class="btn ghost sm" data-join="${esc(c.id)}">${(c.members||[]).includes(meId)?"ออกจากเคส":"＋ เข้าร่วมเคส"}</button>`;
function renderMembers(sel){$("fMembers").innerHTML=staff.length?staff.map(s=>`<label class="chk"><input type="checkbox" value="${esc(s.id)}" ${sel.includes(s.id)?"checked":""}> ${esc(s.name)}</label>`).join(""):`<span class="meta">ยังไม่มีรายชื่อ เพิ่มที่หลังบ้านก่อน</span>`}
function syncMembers(){const o=$("fOwner").value;document.querySelectorAll("#fMembers input").forEach(i=>{if(i.value===o){i.checked=false;i.disabled=true}else i.disabled=false})}
const getMembers=()=>[...document.querySelectorAll("#fMembers input:checked")].map(i=>i.value).filter(v=>v!==$("fOwner").value);

// ---- รูปภาพ: โหลดผ่าน API (ใช้ได้กับ repo private) แล้วเก็บเป็น blob URL ----
function hydratePhotos(root){
  root.querySelectorAll("img[data-p]").forEach(im=>{
    const p=im.dataset.p;
    if(photoSrc.has(p)){if(im.getAttribute("src")!==photoSrc.get(p))im.src=photoSrc.get(p);return}
    photoUrl(p).then(u=>{document.querySelectorAll("img[data-p]").forEach(x=>{if(x.dataset.p===p)x.src=u})}).catch(()=>{im.alt="โหลดรูปไม่ได้";im.classList.add("bad")});
  });
}
function renderPhotoEdit(){
  $("fPhotos").innerHTML=existing.map(p=>`<div class="ph"><img data-p="${esc(p)}" ${photoSrc.has(p)?`src="${photoSrc.get(p)}"`:""} alt="รูปแนบ"><button type="button" class="x" data-rmex="${esc(p)}" aria-label="ลบรูป">✕</button></div>`).join("")
    +pending.map((x,i)=>`<div class="ph"><img src="${x.url}" alt="รูปที่เพิ่งเลือก"><button type="button" class="x" data-rmpend="${i}" aria-label="เอารูปออก">✕</button></div>`).join("");
  $("phCount").textContent="("+(existing.length+pending.length)+"/"+MAXPH+")";
  hydratePhotos($("fPhotos"));
}

function render(){
  const q=$("q").value.trim().toLowerCase(),fd=$("fdate").value,fo=$("fowner").value,fs=$("fstatus").value,fc=$("fcat").value,fz=$("fzone").value;
  const byCase={};logs.forEach(l=>(byCase[l.caseId]=byCase[l.caseId]||[]).push(l));
  Object.values(byCase).forEach(a=>a.sort((x,y)=>x.at-y.at));
  const base=cases.filter(c=>(!fd||c.date===fd)&&(!fz||c.zone===fz));
  const cnt=v=>base.filter(c=>c.status===v).length;
  $("stTotal").textContent=base.length;$("stDoing").textContent=cnt("กำลังดำเนินการ");$("stWait").textContent=cnt("รอส่งต่อ");$("stDone").textContent=cnt("เสร็จสิ้น");
  document.querySelectorAll(".stat").forEach(b=>b.classList.toggle("on",(b.dataset.stat||"")===fs));
  const rows=base.filter(c=>{
    if(fo&&c.owner!==fo&&!(c.members||[]).includes(fo))return false;
    if(fs&&c.status!==fs)return false;
    if(fc&&c.category!==fc)return false;
    if(q){const pr=propOf(c.marsha);const hay=[c.title,c.caseNo,c.detail,c.location,c.category,c.marsha,pr&&pr.name,c.zone?"zone "+c.zone:"",staffName(c.owner),...(c.members||[]).map(staffName),...(byCase[c.id]||[]).map(l=>l.text+" "+l.byName)].join(" ").toLowerCase();if(!hay.includes(q))return false}
    return true}).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
  $("count").textContent=rows.length+" / "+cases.length+" เคส";
  const ae=document.activeElement,keep=ae&&ae.dataset&&ae.dataset.draft;
  $("list").innerHTML=rows.length?rows.map(c=>{
    const ls=byCase[c.id]||[],ms=mem(c),isToday=c.date===todayStr(),pr=propOf(c.marsha);
    const names=[`<b>${esc(staffName(c.owner))}</b> (หลัก)`,...ms.map(id=>esc(staffName(id)))].join(" · ");
    const ph=(c.photos||[]).map(p=>`<img class="thumb" data-p="${esc(p)}" alt="รูปแนบ" ${photoSrc.has(p)?`src="${photoSrc.get(p)}"`:""}>`).join("");
    return `<article class="case ${STC(c.status)}">
      <div class="case-top">
        <div><span class="cid">${c.caseNo?esc(c.caseNo):"NO-TICKET"}</span>${c.zone?`<span class="cat zn">Zone ${esc(c.zone)}</span>`:""}${c.category?`<span class="cat">${CAT[c.category]||"🛠️"} ${esc(c.category)}</span>`:""}</div>
        <span class="badge">${esc(c.status)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <div class="facts">${c.marsha?`<span>🏨 <b class="code">${esc(c.marsha)}</b>${pr&&pr.name?" "+esc(pr.name):""}</span>`:""}${c.location?`<span>📍 ${esc(c.location)}</span>`:""}<span>📅 ${thDate(c.date)} ${isToday?'<span class="todaytag">วันนี้</span>':""}</span></div>
      ${c.detail?`<div class="detail">${esc(c.detail)}</div>`:""}
      ${ph?`<div class="gallery">${ph}</div>`:""}
      <div class="people"><div class="avs">${avatar(c.owner,true)}${ms.map(id=>avatar(id)).join("")}</div><div class="pnames">${names}</div></div>
      ${ls.length?`<ol class="tl">${ls.map(l=>`<li><span class="dot"></span><div class="tx">${esc(l.text)}</div><small>${esc(l.byName)} · ${thTime(l.at)}</small></li>`).join("")}</ol>`:""}
      <div class="case-foot">
        <div class="upd"><input data-draft="${esc(c.id)}" placeholder="อัพเดท / รับช่วงต่อ: ทำอะไรไปแล้ว" value="${esc(drafts[c.id]||"")}"><button class="btn" data-upd="${esc(c.id)}">อัพเดท</button></div>
        <span class="actions">${joinBtn(c)}<button class="btn ghost sm" data-edit="${esc(c.id)}">แก้ไข</button></span>
      </div>
    </article>`}).join(""):`<div class="empty"><div class="ico">📭</div>ยังไม่มีเคสตามเงื่อนไขนี้</div>`;
  hydratePhotos($("list"));
  if(keep){const el=document.querySelector(`[data-draft="${keep}"]`);if(el){el.focus();const n=el.value.length;el.setSelectionRange(n,n)}}
}

function renderAdmin(){
  $("staffList").innerHTML=staff.length?staff.map(s=>`<div class="staffrow">${avatar(s.id)}<span class="nm">${esc(s.name)}</span><select class="zsel" data-sz="${esc(s.id)}" aria-label="โซนของ ${esc(s.name)}">${zoneOpts(s.zone||"","ไม่ระบุโซน")}</select><button class="btn danger sm" data-rm="${esc(s.id)}">ลบ</button></div>`).join(""):`<div class="empty"><div class="ico">👥</div>ยังไม่มีรายชื่อ เพิ่มชื่อด้านบนได้เลย</div>`;
  const ps=[...props].sort((a,b)=>(a.zone||"").localeCompare(b.zone||"")||a.code.localeCompare(b.code));
  $("propList").innerHTML=ps.length?ps.map(p=>`<div class="staffrow"><span class="code pc">${esc(p.code)}</span><span class="nm">${esc(p.name||"—")}</span><select class="zsel" data-pz="${esc(p.id)}" aria-label="โซนของ ${esc(p.code)}">${zoneOpts(p.zone||"")}</select><button class="btn danger sm" data-rmp="${esc(p.id)}">ลบ</button></div>`).join(""):`<div class="empty"><div class="ico">🏨</div>ยังไม่มี MARSHA เพิ่มรหัสโรงแรมด้านบนได้เลย</div>`;
}

function fillMarsha(zone,sel){
  const list=props.filter(p=>p.zone===zone).sort((a,b)=>a.code.localeCompare(b.code));
  let o=list.length?`<option value="">— ไม่ระบุ MARSHA —</option>`:`<option value="">ยังไม่มี MARSHA ในโซนนี้ (เพิ่มที่หลังบ้าน)</option>`;
  o+=list.map(p=>`<option value="${esc(p.code)}">${esc(p.code)}${p.name?" · "+esc(p.name):""}</option>`).join("");
  if(sel&&!list.some(p=>p.code===sel))o+=`<option value="${esc(sel)}">${esc(sel)} (ไม่อยู่ในโซนนี้)</option>`;
  $("fMarsha").innerHTML=o;$("fMarsha").value=sel||"";
}

function openDlg(c){
  editing=c||null;
  $("dlgTitle").textContent=c?"แก้ไขเคส":"เพิ่มเคสใหม่";
  const zone=c?(c.zone||""):(staffZone(meId)||lsGet("lastZone")||"1");
  $("fZone").innerHTML=zoneOpts(zone,c?"ไม่ระบุโซน":"");$("fZone").value=zone;
  fillMarsha(zone,c?c.marsha||"":"");
  $("fNo").value=c?c.caseNo||"":"";$("fCat").value=(c&&c.category)||"Network";$("fLoc").value=c?c.location||"":"";$("fTitle").value=c?c.title:"";$("fDetail").value=c?c.detail||"":"";
  $("fDate").value=c?c.date:todayStr();$("fStatus").value=c?c.status:"กำลังดำเนินการ";
  fillStaffSelects();$("fOwner").value=c?c.owner:(meId||(staff[0]&&staff[0].id)||"");renderMembers(c?mem(c):[]);syncMembers();
  existing=c?[...(c.photos||[])]:[];pending=[];renderPhotoEdit();
  $("del").style.display=c?"":"none";$("dlg").showModal();
}

// กดบันทึก: ถ้าเป็นเคสใหม่ให้ขึ้นหน้าต่างเตือนก่อน ถ้าเป็นการแก้ไขบันทึกเลย
function saveCase(){
  if(!$("fTitle").value.trim()){toast("กรุณาใส่ชื่อเคส");return}
  if(editing){doSave();return}
  const w=$("warn");
  if(w&&w.showModal)w.showModal();
  else if(confirm("⚠️ อย่าใส่ข้อมูลสำคัญหรือข้อมูลลับในเคสและรูปภาพ ถ้ามีรายละเอียดสำคัญให้แจ้งผ่านช่องทางอื่นแทน\n\nกด OK เพื่อบันทึกต่อ"))doSave();
}
async function removeFiles(list){for(const p of list){try{await ghDeleteFile(p)}catch(e){console.warn("ลบไฟล์รูปไม่สำเร็จ",p,e)}}}
async function doSave(){
  const title=$("fTitle").value.trim();if(!title){toast("กรุณาใส่ชื่อเคส");return}
  const data={caseNo:$("fNo").value.trim(),title,detail:$("fDetail").value.trim(),date:$("fDate").value||todayStr(),status:$("fStatus").value,owner:$("fOwner").value,members:getMembers(),category:$("fCat").value,location:$("fLoc").value.trim(),zone:$("fZone").value,marsha:$("fMarsha").value};
  const old=editing,isNew=!old;let ok=false;
  $("save").disabled=true;
  await guard(async()=>{
    if(pending.length)toast("กำลังอัปโหลดรูป...");
    while(pending.length){
      const x=pending[0],path="photos/"+Date.now()+"-"+uid()+".jpg";
      await putFile(path,await blobB64(x.blob));
      photoSrc.set(path,x.url);existing.push(path);pending.shift();
    }
    data.photos=[...existing];
    if(old)await api("updateCase",old.id,data,meId,myName());
    else await api("addCase",data,meId);
    ok=true;$("dlg").close();toast("บันทึกแล้ว");
  });
  $("save").disabled=false;
  if(!ok)return;
  try{localStorage.setItem("lastZone",data.zone||"")}catch(e){}
  if(old){const gone=(old.photos||[]).filter(p=>!(data.photos||[]).includes(p));if(gone.length)removeFiles(gone)}
  // ครั้งแรกที่ยังไม่ได้เลือก "ฉันคือ": ถามว่าจะจำคนที่เลือกเป็นชื่อของฉันไหม
  if(isNew&&!meId&&data.owner&&staff.some(x=>x.id===data.owner)&&confirm("ให้จำ \""+staffName(data.owner)+"\" เป็นชื่อของคุณ และตั้งเป็นค่าเริ่มต้นทุกครั้งที่เปิดเคสใหม่ไหม?")){
    meId=data.owner;try{localStorage.setItem("meId",meId)}catch(e){}
    fillStaffSelects();toast("จำชื่อ "+staffName(meId)+" แล้ว");
  }
}

document.addEventListener("click",async e=>{
  const im=e.target.closest&&e.target.closest("img[data-p]");
  if(im&&im.getAttribute("src")){$("lbImg").src=im.src;$("lb").showModal();return}
  const t=e.target.closest("button");if(!t)return;
  if(t.dataset.t){
    if(t.dataset.t==="admin"&&!adminPin){
      const p=prompt("ใส่ PIN หลังบ้าน");if(!p)return;
      try{if(!(await api("checkPin",p))){toast("PIN ไม่ถูกต้อง");return}adminPin=p}catch(x){toast("ตรวจ PIN ไม่ได้");return}
    }
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b===t));
    $("casesView").hidden=t.dataset.t!=="cases";$("adminView").hidden=t.dataset.t!=="admin";
  }
  if(t.dataset.stat!==undefined){$("fstatus").value=t.dataset.stat;render();return}
  if(t.dataset.rmex){existing=existing.filter(p=>p!==t.dataset.rmex);renderPhotoEdit();return}
  if(t.dataset.rmpend!==undefined){pending.splice(+t.dataset.rmpend,1);renderPhotoEdit();return}
  if(t.dataset.join){if(!meId){toast("เลือกชื่อ \"ฉันคือ\" มุมขวาบนก่อน");return}
    t.disabled=true;await guard(async()=>{await api("toggleJoin",t.dataset.join,meId,myName());toast("อัพเดทผู้ร่วมเคสแล้ว")});t.disabled=false}
  if(t.dataset.edit)openDlg(cases.find(c=>c.id===t.dataset.edit));
  if(t.dataset.upd){const id=t.dataset.upd,inp=document.querySelector(`[data-draft="${id}"]`),v=inp.value.trim();if(!v)return;
    t.disabled=true;await guard(async()=>{await api("addLog",id,v,meId,myName());drafts[id]="";toast("เพิ่มอัพเดทแล้ว")});t.disabled=false}
  if(t.dataset.rm){const s=staff.find(x=>x.id===t.dataset.rm);if(s&&confirm("ลบ "+s.name+" ออกจากรายชื่อ?"))guard(()=>api("removeStaff",s.id,adminPin))}
  if(t.dataset.rmp){const p=props.find(x=>x.id===t.dataset.rmp);if(p&&confirm("ลบ MARSHA "+p.code+" ? (เคสเดิมยังเก็บรหัสนี้ไว้)"))guard(()=>api("removeProperty",p.id,adminPin))}
});
document.addEventListener("change",e=>{
  const t=e.target;if(!t.dataset)return;
  if(t.dataset.sz!==undefined)guard(()=>api("setStaffZone",t.dataset.sz,t.value,adminPin));
  if(t.dataset.pz!==undefined)guard(()=>api("setPropertyZone",t.dataset.pz,t.value,adminPin));
});
document.addEventListener("input",e=>{if(e.target.dataset&&e.target.dataset.draft)drafts[e.target.dataset.draft]=e.target.value});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.dataset&&e.target.dataset.draft){const b=document.querySelector(`[data-upd="${e.target.dataset.draft}"]`);b&&b.click()}});
["q","fdate","fowner","fstatus","fcat","fzone"].forEach(i=>$(i).addEventListener("input",render));
$("today").onclick=()=>{$("fdate").value=todayStr();render()};
$("all").onclick=()=>{$("fdate").value="";render()};
$("reload").onclick=()=>{refresh(true).then(()=>toast("อัพเดทข้อมูลล่าสุดแล้ว"))};
$("add").onclick=()=>openDlg(null);
$("fOwner").addEventListener("change",syncMembers);
$("fZone").addEventListener("change",()=>fillMarsha($("fZone").value,""));
$("addPhoto").onclick=()=>$("fFile").click();
$("fFile").onchange=async e=>{
  const files=[...e.target.files];e.target.value="";
  for(const f of files){
    if(existing.length+pending.length>=MAXPH){toast("แนบรูปได้สูงสุด "+MAXPH+" รูปต่อเคส");break}
    try{const blob=await compressImage(f);pending.push({blob,url:URL.createObjectURL(blob)})}catch(err){toast(err.message)}
  }
  renderPhotoEdit();
};
$("lb").onclick=()=>$("lb").close();
$("cancel").onclick=()=>$("dlg").close();
$("save").onclick=saveCase;
$("warnBack").onclick=()=>$("warn").close();
$("warnOk").onclick=()=>{$("warn").close();doSave()};
$("del").onclick=()=>{if(editing&&confirm("ลบเคสนี้ถาวร?")){const id=editing.id,paths=[...(editing.photos||[])];guard(async()=>{await api("deleteCase",id);$("dlg").close();toast("ลบแล้ว");removeFiles(paths)})}};
$("me").onchange=e=>{meId=e.target.value;try{localStorage.setItem("meId",meId)}catch(x){}};
$("addStaff").onclick=()=>{const n=$("newName").value.trim();if(!n)return;guard(async()=>{await api("addStaff",n,adminPin,$("newStaffZone").value);$("newName").value="";toast("เพิ่มชื่อแล้ว")})};
$("newName").addEventListener("keydown",e=>{if(e.key==="Enter")$("addStaff").click()});
$("addProp").onclick=()=>{
  const code=$("newCode").value.trim().toUpperCase();
  if(!/^[A-Z0-9]{3,8}$/.test(code)){toast("MARSHA code ต้องเป็นตัวอักษร/ตัวเลข 3-8 ตัว เช่น BKKMD");return}
  guard(async()=>{await api("addProperty",code,$("newProp").value.trim(),$("newPropZone").value,adminPin);$("newCode").value="";$("newProp").value="";toast("เพิ่ม MARSHA แล้ว")});
};
["newCode","newProp"].forEach(i=>$(i).addEventListener("keydown",e=>{if(e.key==="Enter")$("addProp").click()}));

function tick(){const d=new Date();$("clock").textContent=d.toLocaleTimeString("th-TH",{hour12:false});$("nowDate").textContent=d.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
tick();setInterval(tick,1000);
refresh();
setInterval(()=>{if(token&&!document.hidden&&!$("dlg").open)refresh()},15000);
