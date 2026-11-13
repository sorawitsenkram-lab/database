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
// ---- เข้าสู่ระบบด้วย "รหัสทีม" ----
// auth.json (อยู่ใน repo ข้าง index.html) เก็บ GitHub Token ที่เข้ารหัสด้วยรหัสทีมไว้ คนทั่วไปพิมพ์แค่รหัสทีม
// เจ้าของระบบตั้งค่าครั้งแรกได้ในหน้าเว็บนี้เลย (วาง Token ครั้งเดียว + ตั้งรหัสทีม) ระบบสร้าง auth.json ให้เอง
const b64=u=>{let s="";u.forEach(x=>s+=String.fromCharCode(x));return btoa(s)};
const unb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
async function aesKey(code,salt,iter,usage){
  const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(code),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:iter,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,[usage]);
}
async function encryptAuth(tok,code){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iter=310000;
  const key=await aesKey(code,salt,iter,"encrypt");
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(tok)));
  return {v:1,iter,salt:b64(salt),iv:b64(iv),data:b64(ct),rev:Date.now()};
}
async function decryptAuth(a,code){
  const key=await aesKey(code,unb64(a.salt),a.iter,"decrypt");
  try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(a.iv)},key,unb64(a.data)))}
  catch(e){throw new Error("รหัสทีมไม่ถูกต้อง")}
}
async function fetchAuth(){
  try{const r=await fetch("auth.json?v="+Date.now(),{cache:"no-store"});if(!r.ok)return null;const a=await r.json();return a&&a.data?a:null}catch(e){return null}
}
function siteRepo(){   // repo ที่เปิดเว็บ (GitHub Pages) เป็นที่เก็บ auth.json
  const h=location.hostname;
  if(h.endsWith(".github.io")){const repo=location.pathname.split("/")[1];if(repo)return{owner:h.split(".")[0],repo}}
  return{owner:C.OWNER,repo:C.REPO};
}
async function putAuth(tok,auth){
  const {owner,repo}=siteRepo(),url=`https://api.github.com/repos/${owner}/${repo}/contents/auth.json`,H={Accept:"application/vnd.github+json",Authorization:"Bearer "+tok};
  let old;
  const g=await fetch(url+"?ref="+encodeURIComponent(C.BRANCH||"main"),{headers:H,cache:"no-store"});
  if(g.ok)old=(await g.json()).sha;else if(g.status!==404)throw await ghError(g);
  const body={message:"ตั้งรหัสทีม",content:b64enc(JSON.stringify(auth)),branch:C.BRANCH||"main"};if(old)body.sha=old;
  const r=await fetch(url,{method:"PUT",headers:{...H,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw await ghError(r);
}
const isWeak=c=>c.length<8||/^\d+$/.test(c);
const WEAK_MSG="⚠️ รหัสนี้สั้นหรือเป็นตัวเลขล้วน เดาง่ายมาก\n\nไฟล์ auth.json อยู่ใน repo ที่คนอื่นเปิดดูได้ ผู้ไม่หวังดีลองเดารหัสได้ไม่จำกัดครั้ง ถ้าเดาถูกจะได้ Token ไปแก้หรือลบข้อมูลได้\nแนะนำวลียาวอย่างน้อย 8-10 ตัวอักษร\n\nต้องการใช้รหัสนี้ต่อไหม?";
function loginFlow(){
  return new Promise(async resolve=>{
    const auth=await fetchAuth(),dlg=$("login");let mode=auth?"team":"setup";
    const show=()=>{
      $("loginTeam").hidden=mode!=="team";$("loginSetup").hidden=mode!=="setup";
      $("loginTitle").textContent=mode==="team"?"เข้าสู่ระบบ":"ตั้งค่าครั้งแรก (เจ้าของระบบ)";
      $("loginDesc").textContent=mode==="team"?"ใส่รหัสทีมที่ผู้ดูแลกำหนด":"ยังไม่เคยตั้งรหัสทีม วาง GitHub Token และตั้งรหัสทีมของคุณ ทำครั้งเดียว หลังจากนี้ทุกคนเข้าด้วยรหัสทีมอย่างเดียว ไม่ต้องใช้ Token";
      $("lgGo").textContent=mode==="team"?"เข้าใช้งาน":"ตั้งค่าและเข้าใช้งาน";
      $("lgSwitch").textContent=mode==="team"?"เจ้าของระบบ: ตั้งค่าใหม่ / ลืมรหัสทีม":"← กลับไปใส่รหัสทีม";
      $("lgSwitch").hidden=mode==="setup"&&!auth;
      $("lgErr").textContent="";
    };
    const finish=(t,rev)=>{
      token=t;try{localStorage.setItem("ghToken",t);localStorage.setItem("ghRev",String(rev||""))}catch(e){}
      ["lgCode","lgToken","lgNew","lgNew2"].forEach(i=>$(i).value="");dlg.close();resolve();
    };
    show();dlg.showModal();
    $("lgSwitch").onclick=()=>{mode=mode==="team"?"setup":"team";show()};
    $("lgGo").onclick=async()=>{
      const btn=$("lgGo"),err=$("lgErr");btn.disabled=true;err.textContent="";
      try{
        if(mode==="team"){
          const code=$("lgCode").value.trim();if(!code)throw new Error("กรุณาใส่รหัสทีม");
          finish(await decryptAuth(auth,code),auth.rev);
        }else{
          const t=$("lgToken").value.trim(),c1=$("lgNew").value.trim(),c2=$("lgNew2").value.trim();
          if(!/^(github_pat_|ghp_|gho_)/.test(t))throw new Error("Token ไม่ถูกต้อง ต้องขึ้นต้นด้วย github_pat_ (คัดลอกให้ครบ)");
          if(!c1)throw new Error("กรุณาตั้งรหัสทีม");
          if(c1!==c2)throw new Error("รหัสทีมสองช่องไม่ตรงกัน");
          if(isWeak(c1)&&!confirm(WEAK_MSG))throw new Error("ตั้งรหัสทีมที่ยาวขึ้นแล้วลองใหม่");
          const a=await encryptAuth(t,c1);await putAuth(t,a);
          finish(t,a.rev);
          toast("ตั้งรหัสทีมแล้ว รอ 1-2 นาทีให้เว็บอัพเดท แล้วให้ทีมเข้าด้วยรหัสนี้ได้เลย");
        }
      }catch(e){err.textContent=(e&&e.message)||"เกิดข้อผิดพลาด"}
      btn.disabled=false;
    };
  });
}
let revChecked=false,tokenP=null;
async function ensureToken(){
  if(!C.OWNER||!C.REPO)throw new Error("ยังไม่ได้ใส่ OWNER/REPO ที่ต้นไฟล์ app.js");
  if(token&&!revChecked){   // ถ้าผู้ดูแลเปลี่ยนรหัสทีมไปแล้ว ให้ใส่รหัสใหม่
    revChecked=true;
    const a=await fetchAuth();let mine="";try{mine=localStorage.getItem("ghRev")||""}catch(e){}
    if(a&&Number(a.rev)>Number(mine||0)){token="";try{localStorage.removeItem("ghToken")}catch(e){}}
  }
  if(token)return;
  if(!tokenP)tokenP=loginFlow().finally(()=>{tokenP=null});
  await tokenP;
  if(!token)throw new Error("ต้องเข้าสู่ระบบก่อนใช้งาน");
}
// ---- กล่องตั้งรหัส/PIN ใหม่ (ใช้ทั้งเปลี่ยน PIN และรหัสทีม) ----
function askSecret(o){
  return new Promise(resolve=>{
    const d=$("pinDlg");
    $("pinIco").textContent=o.ico||"🔐";$("pinTitle").textContent=o.title;$("pinDesc").textContent=o.desc;
    $("pnLab").textContent=o.label;$("pnLab2").textContent="ยืนยัน"+o.label;
    $("pnNew").value="";$("pnNew2").value="";$("pnErr").textContent="";$("pnCancel").hidden=!!o.forced;
    d.oncancel=e=>{if(o.forced)e.preventDefault();else resolve(null)};
    $("pnCancel").onclick=()=>{d.close();resolve(null)};
    $("pnGo").onclick=async()=>{
      const v=$("pnNew").value.trim(),v2=$("pnNew2").value.trim(),err=$("pnErr");err.textContent="";
      if(!v){err.textContent="กรุณากรอก"+o.label;return}
      if(v!==v2){err.textContent=o.label+"สองช่องไม่ตรงกัน";return}
      const bad=o.validate&&o.validate(v);if(bad){err.textContent=bad;return}
      $("pnGo").disabled=true;
      try{await o.save(v);d.close();resolve(v)}catch(e){err.textContent=(e&&e.message)||"บันทึกไม่ได้"}
      $("pnGo").disabled=false;
    };
    d.showModal();
  });
}
const hdr=()=>({Accept:"application/vnd.github+json",Authorization:"Bearer "+token});
async function ghError(r){
  let m="";try{m=(await r.json()).message||""}catch(e){}
  if(r.status===401){token="";try{localStorage.removeItem("ghToken")}catch(e){}return new Error("Token ที่ใช้อยู่หมดอายุหรือถูกยกเลิก กดรีเฟรช แล้วให้เจ้าของระบบเลือก \"ตั้งค่าใหม่ / ลืมรหัสทีม\" เพื่อวาง Token ใหม่")}
  if(r.status===403||r.status===429)return new Error("ไม่มีสิทธิ์ หรือเรียกถี่เกินไป (ตรวจว่า Token มีสิทธิ์ Contents: Read and write) "+m);
  if(r.status===404)return new Error("ไม่พบ repo/ไฟล์ข้อมูล หรือ Token ไม่มีสิทธิ์เข้าถึง repo นี้");
  return new Error(m||"เกิดข้อผิดพลาดกับ GitHub ("+r.status+")");
}
const norm=d=>({staff:d.staff||[],cases:d.cases||[],logs:d.logs||[],properties:d.properties||[],settings:d.settings||{}});
async function load(force){
  await ensureToken();
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
async function pinOk(p){
  const st=(await load(false)).settings||{};p=String(p);
  return st.pinHash?(await sha256((st.pinSalt||"")+p))===st.pinHash:(await sha256(p))===C.ADMIN_PIN_SHA256;   // ยังไม่เคยตั้ง = PIN เริ่มต้น 1234
}
// ---- ไฟล์รูป: เก็บเป็นไฟล์ใน repo (โฟลเดอร์ photos/) อ่าน/เขียนผ่าน GitHub API ----
const pathUrl=p=>`https://api.github.com/repos/${C.OWNER}/${C.REPO}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;
async function putFile(path,b64){
  await ensureToken();
  const r=await fetch(pathUrl(path),{method:"PUT",headers:{...hdr(),"Content-Type":"application/json"},body:JSON.stringify({message:"แนบรูป",content:b64,branch:C.BRANCH||"main"})});
  if(!r.ok)throw await ghError(r);
}
async function ghDeleteFile(path){
  await ensureToken();
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
    await ensureToken();
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
const inCaseOf=(c,id)=>!!id&&(c.owner===id||(c.members||[]).includes(id));
const sz=(db,id)=>{const x=db.staff.find(v=>v.id===id);return x?(x.zone||"1"):""};
const nameOf=(d,id)=>(d.staff.find(s=>s.id===id)||{}).name||"(ไม่ระบุ)";
const API={
  getAll:async()=>{const d=await load(false);return JSON.parse(JSON.stringify(d))},
  checkPin:async p=>{const ok=await pinOk(p);return{ok,isDefault:!((await load(false)).settings||{}).pinHash}},
  setPin:async(oldPin,newPin)=>{await needPin(oldPin);const salt=uid()+uid(),hash=await sha256(salt+String(newPin));return mutate(db=>{db.settings={...(db.settings||{}),pinSalt:salt,pinHash:hash}},"เปลี่ยน PIN หลังบ้าน")},
  addCase:(d,by)=>mutate(db=>{const id=uid();const z=d.zone||"1";
    if(d.status==="เสร็จสิ้น"&&!(by&&(by===d.owner||(d.members||[]).includes(by))))throw new Error("เฉพาะผู้รับผิดชอบหรือผู้ร่วมเคสนี้เท่านั้นที่ปิดเคสได้");if(d.owner&&sz(db,d.owner)!==z)throw new Error("ผู้รับผิดชอบต้องอยู่โซนเดียวกับเคส");db.cases.push({id,caseNo:d.caseNo||"",title:d.title,detail:d.detail||"",date:d.date,status:d.status,owner:d.owner||null,category:d.category||"",location:d.location||"",zone:z,marsha:d.marsha||"",photos:d.photos||[],members:(d.members||[]).filter(x=>x!==d.owner&&sz(db,x)===z),createdAt:Date.now(),createdBy:by||""});return id},"เพิ่มเคส: "+d.title),
  updateCase:(id,d,by,name)=>mutate(db=>{
    const c=db.cases.find(x=>x.id===id);if(!c)throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    const z=c.zone||"1",oo=c.owner,os=c.status,om=c.members||[],omar=c.marsha||"";
    if(d.status==="เสร็จสิ้น"&&os!=="เสร็จสิ้น"&&!(by&&(by===oo||om.includes(by))))throw new Error("เฉพาะผู้รับผิดชอบหรือผู้ร่วมเคสนี้เท่านั้นที่ปิดเคสได้");
    if(d.owner&&d.owner!==oo&&sz(db,d.owner)!==z)throw new Error("ผู้รับผิดชอบต้องอยู่โซนเดียวกับเคส");
    const nm=(d.members||[]).filter(x=>x!==(d.owner||null)&&(sz(db,x)===z||om.includes(x)));
    Object.assign(c,{caseNo:d.caseNo||"",title:d.title,detail:d.detail||"",date:d.date,status:d.status,owner:d.owner||null,category:d.category||"",location:d.location||"",zone:z,marsha:d.marsha||"",photos:d.photos||[],members:nm});
    const notes=[];
    if(omar!==(c.marsha||""))notes.push("เปลี่ยน MARSHA เป็น "+(c.marsha||"ไม่ระบุ"));
    if((oo||null)!==(c.owner||null))notes.push("ส่งต่อเคสจาก "+nameOf(db,oo)+" ไปยัง "+nameOf(db,c.owner));
    else if(os!==c.status)notes.push("เปลี่ยนสถานะเป็น "+c.status);
    const added=nm.filter(x=>!om.includes(x)),removed=om.filter(x=>!nm.includes(x));
    if(added.length)notes.push("เพิ่มผู้ร่วมเคส: "+added.map(x=>nameOf(db,x)).join(", "));
    if(removed.length)notes.push("นำออกจากเคส: "+removed.map(x=>nameOf(db,x)).join(", "));
    notes.forEach(n=>db.logs.push({id:uid(),caseId:id,text:n,by:by||"",byName:name||"ไม่ระบุชื่อ",at:Date.now()}));
  },"แก้ไขเคส: "+d.title),
  setStatus:(id,status,by,name)=>mutate(db=>{
    const c=db.cases.find(x=>x.id===id);if(!c)throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    if(!inCaseOf(c,by))throw new Error("เฉพาะผู้รับผิดชอบหรือผู้ร่วมเคสนี้เท่านั้นที่เปลี่ยนสถานะได้");
    if(c.status===status)return;
    c.status=status;
    db.logs.push({id:uid(),caseId:id,text:status==="เสร็จสิ้น"?"ปิดเคส: เสร็จสิ้น ✓":"เปิดเคสอีกครั้ง (กลับเป็น "+status+")",by,byName:name||"ไม่ระบุชื่อ",at:Date.now()});
  },"เปลี่ยนสถานะเคส"),
  toggleJoin:(id,sid,name)=>mutate(db=>{
    const c=db.cases.find(x=>x.id===id);if(!c)throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    if(c.owner===sid)throw new Error("คุณเป็นผู้รับผิดชอบหลักของเคสนี้อยู่แล้ว");
    c.members=c.members||[];
    const had=c.members.includes(sid);
    if(!had&&sz(db,sid)!==(c.zone||"1"))throw new Error("คุณอยู่คนละโซนกับเคสนี้ เข้าร่วมไม่ได้");
    c.members=had?c.members.filter(x=>x!==sid):[...c.members,sid];
    db.logs.push({id:uid(),caseId:id,text:nameOf(db,sid)+(had?" ออกจากเคส":" เข้าร่วมเคส"),by:sid,byName:name||"ไม่ระบุชื่อ",at:Date.now()});
  },"เข้า/ออกจากเคส"),
  addLog:(id,text,by,name)=>mutate(db=>{
    if(!db.cases.some(x=>x.id===id))throw new Error("ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)");
    db.logs.push({id:uid(),caseId:id,text,by:by||"",byName:name||"ไม่ระบุชื่อ",at:Date.now()});
  },"อัพเดทเคส"),
  deleteCase:id=>mutate(db=>{db.cases=db.cases.filter(x=>x.id!==id);db.logs=db.logs.filter(x=>x.caseId!==id)},"ลบเคส"),
  addStaff:async(name,pin,zone)=>{await needPin(pin);return mutate(db=>{db.staff.push({id:uid(),name:String(name).trim(),zone:zone||"1",at:Date.now()})},"เพิ่มรายชื่อ: "+name)},
  setStaffZone:async(id,zone,pin)=>{await needPin(pin);return mutate(db=>{const x=db.staff.find(v=>v.id===id);if(x)x.zone=zone||"1"},"ย้ายโซนสมาชิก")},
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
let staff=[],cases=[],logs=[],props=[],editing=null,drafts={},adminPin="",lastSig="",existing=[],pending=[],lastRows=[],lastByCase={};
let meId="";try{meId=localStorage.getItem("meId")||""}catch(e){}
const lsGet=k=>{try{return localStorage.getItem(k)||""}catch(e){return ""}};
let curZone=lsGet("zone");
const szone=s=>s.zone||"1",czone=c=>c.zone||"1";
const staffById=id=>staff.find(s=>s.id===id)||null;
const staffName=id=>(staffById(id)||{}).name||"(ไม่ระบุ)";
const staffZone=id=>{const s=staffById(id);return s?szone(s):""};
const zoneStaff=()=>staff.filter(s=>szone(s)===curZone);
const curMe=()=>meId&&staffZone(meId)===curZone?meId:"";   // ตัวตนของฉัน ใช้ได้เฉพาะในโซนของตัวเอง
const myName=()=>curMe()?staffName(curMe()):"ไม่ระบุชื่อ";
const zoneOpts=(sel,blank)=>(blank?`<option value="">${blank}</option>`:"")+ZONES.map(z=>`<option value="${z}"${z===sel?" selected":""}>Zone ${z}</option>`).join("");
const propOf=code=>props.find(p=>p.code===code)||null;

async function refresh(force){
  try{
    const d=await api("getAll");
    const sig=JSON.stringify([d.staff,d.cases,d.logs,d.properties]);
    if(sig===lastSig&&!force)return;
    lastSig=sig;staff=d.staff;cases=d.cases;logs=d.logs;props=d.properties||[];
    if(meId&&!staff.some(x=>x.id===meId))meId="";
    if(!curZone)curZone=(meId&&staffZone(meId))||"1";
    fillStaffSelects();renderZones();renderAdmin();render();
  }catch(e){console.error(e);toast((e&&e.message)||"โหลดข้อมูลไม่ได้ ลองกดรีเฟรช")}
}
async function guard(fn){try{await fn();await refresh()}catch(e){console.error(e);toast((e&&e.message)||"บันทึกไม่ได้ ลองใหม่")}}

function fillStaffSelects(){
  const opts=zoneStaff().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  $("me").innerHTML=`<option value="">— เลือกชื่อ —</option>`+opts;$("me").value=curMe();
  const fo=$("fowner"),v=fo.value;fo.innerHTML=`<option value="">ทุกคนใน Zone ${curZone}</option>`+opts;fo.value=v;
  const o=$("fOwner"),ov=o.value;o.innerHTML=opts;if(ov)o.value=ov;
  fillMarFilter();
}
function fillMarFilter(){
  const sel=$("fmar"),v=sel.value;
  const codes=new Set(props.filter(p=>(p.zone||"1")===curZone).map(p=>p.code));
  cases.filter(c=>czone(c)===curZone&&c.marsha).forEach(c=>codes.add(c.marsha));
  const arr=[...codes].sort();
  sel.innerHTML=`<option value="">ทุก MARSHA</option>`+arr.map(code=>{const p=propOf(code);return `<option value="${esc(code)}">${esc(code)}${p&&p.name?" · "+esc(p.name):""}</option>`}).join("")+`<option value="__none">(ไม่ระบุ MARSHA)</option>`;
  sel.value=(v==="__none"||arr.includes(v))?v:"";
}
function renderZones(){
  document.querySelectorAll(".zbtn").forEach(b=>{
    const z=b.dataset.zone;b.classList.toggle("on",z===curZone);
    const n=cases.filter(c=>czone(c)===z&&c.status!=="เสร็จสิ้น").length;
    const i=b.querySelector("i");if(i)i.textContent=n;
  });
  $("zonePill").textContent="ZONE "+curZone;
  $("newStaffZone").value=curZone;$("newPropZone").value=curZone;
}
function setZone(z){
  curZone=z;try{localStorage.setItem("zone",z)}catch(e){}
  $("fowner").value="";$("fmar").value="";fillStaffSelects();renderZones();render();
}

const mem=c=>(c.members||[]).filter(id=>staff.some(s=>s.id===id));
const CAT={"Network":"🌐","Server":"🖥️","POS/PMS":"🧾","CCTV":"📹","Wi-Fi":"📶","PC/Hardware":"💻","Software":"🧩","Printer":"🖨️","Phone/PBX":"☎️","Email/Account":"📧","อื่นๆ":"🛠️"};
const STC=v=>v==="เสร็จสิ้น"?"done":v==="รอส่งต่อ"?"wait":"doing";
const ini=n=>{const t=String(n||"?").trim().replace(/^[เแโใไ]/,"");return ([...t][0]||"?").toUpperCase()};
const hue=x=>{let h=0;for(const ch of String(x))h=(h*31+ch.charCodeAt(0))%360;return h};
const avatar=(id,main)=>{const ok=staff.some(s=>s.id===id);return `<span class="av${main?" main":""}" style="--h:${hue(id)}" title="${esc(staffName(id))}${main?" (ผู้รับผิดชอบหลัก)":""}">${ok?esc(ini(staffName(id))):"?"}</span>`};
const closeBtn=c=>{
  const m=curMe(),ok=inCaseOf(c,m),done=c.status==="เสร็จสิ้น";
  const tip=!m?"เลือกชื่อ ฉันคือ ในส่วนหัวก่อน":!ok?"เฉพาะผู้รับผิดชอบหรือผู้ร่วมเคสนี้เท่านั้น":"";
  return done?`<button class="btn ghost sm${ok?"":" off"}" data-reopen="${esc(c.id)}" title="${esc(tip||"เปิดเคสอีกครั้ง")}">↺ เปิดอีกครั้ง</button>`
             :`<button class="btn ok sm${ok?"":" off"}" data-done="${esc(c.id)}" title="${esc(tip||"ปิดเคสเป็นเสร็จสิ้น")}">✓ เสร็จสิ้น</button>`;
};
const joinBtn=c=>c.owner&&c.owner===curMe()?"":`<button class="btn ghost sm" data-join="${esc(c.id)}">${(c.members||[]).includes(curMe())?"ออกจากเคส":"＋ เข้าร่วมเคส"}</button>`;
function renderMembers(sel){$("fMembers").innerHTML=zoneStaff().length?zoneStaff().map(s=>`<label class="chk"><input type="checkbox" value="${esc(s.id)}" ${sel.includes(s.id)?"checked":""}> ${esc(s.name)}</label>`).join(""):`<span class="meta">ยังไม่มีรายชื่อ เพิ่มที่หลังบ้านก่อน</span>`}
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
  const q=$("q").value.trim().toLowerCase(),fd=$("fdate").value,fo=$("fowner").value,fs=$("fstatus").value,fc=$("fcat").value,fm=$("fmar").value;
  const byCase={};logs.forEach(l=>(byCase[l.caseId]=byCase[l.caseId]||[]).push(l));
  Object.values(byCase).forEach(a=>a.sort((x,y)=>x.at-y.at));
  const base=cases.filter(c=>czone(c)===curZone&&(!fd||c.date===fd)&&(!fm||(fm==="__none"?!c.marsha:c.marsha===fm)));
  const cnt=v=>base.filter(c=>c.status===v).length;
  $("stTotal").textContent=base.length;$("stDoing").textContent=cnt("กำลังดำเนินการ");$("stWait").textContent=cnt("รอส่งต่อ");$("stDone").textContent=cnt("เสร็จสิ้น");
  document.querySelectorAll(".stat").forEach(b=>b.classList.toggle("on",(b.dataset.stat||"")===fs));
  const rows=base.filter(c=>{
    if(fo&&c.owner!==fo&&!(c.members||[]).includes(fo))return false;
    if(fs&&c.status!==fs)return false;
    if(fc&&c.category!==fc)return false;
    if(q){const pr=propOf(c.marsha);const hay=[c.title,c.caseNo,c.detail,c.location,c.category,c.marsha,pr&&pr.name,staffName(c.owner),...(c.members||[]).map(staffName),...(byCase[c.id]||[]).map(l=>l.text+" "+l.byName)].join(" ").toLowerCase();if(!hay.includes(q))return false}
    return true}).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
  $("count").textContent=rows.length+" / "+cases.filter(c=>czone(c)===curZone).length+" เคส";
  lastRows=rows;lastByCase=byCase;
  const bn=$("marBanner");
  if(fm){
    const allm=cases.filter(c=>czone(c)===curZone&&(fm==="__none"?!c.marsha:c.marsha===fm)),nn=v=>allm.filter(c=>c.status===v).length,pm=propOf(fm);
    bn.hidden=false;
    bn.innerHTML=`<div>🏨 <b class="code">${fm==="__none"?"ไม่ระบุ MARSHA":esc(fm)}</b>${pm&&pm.name?" · "+esc(pm.name):""}<span class="meta"> &nbsp;Zone ${esc(curZone)} · ทั้งหมด ${allm.length} เคส (กำลังดำเนินการ ${nn("กำลังดำเนินการ")} · รอส่งต่อ ${nn("รอส่งต่อ")} · เสร็จสิ้น ${nn("เสร็จสิ้น")})</span></div><button class="btn ghost sm" data-marclear="1">ดูทุก MARSHA</button>`;
  }else bn.hidden=true;
  const ae=document.activeElement,keep=ae&&ae.dataset&&ae.dataset.draft;
  $("list").innerHTML=rows.length?rows.map(c=>{
    const ls=byCase[c.id]||[],ms=mem(c),isToday=c.date===todayStr(),pr=propOf(c.marsha);
    const names=[`<b>${esc(staffName(c.owner))}</b> (หลัก)`,...ms.map(id=>esc(staffName(id)))].join(" · ");
    const ph=(c.photos||[]).map(p=>`<img class="thumb" data-p="${esc(p)}" alt="รูปแนบ" ${photoSrc.has(p)?`src="${photoSrc.get(p)}"`:""}>`).join("");
    return `<article class="case ${STC(c.status)}">
      <div class="case-top">
        <div><span class="cid">${c.caseNo?esc(c.caseNo):"NO-TICKET"}</span>${c.category?`<span class="cat">${CAT[c.category]||"🛠️"} ${esc(c.category)}</span>`:""}</div>
        <span class="topr"><span class="badge">${esc(c.status)}</span>${closeBtn(c)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <div class="facts">${c.marsha?`<button type="button" class="linkbtn" data-mar="${esc(c.marsha)}" title="ดูเคสทั้งหมดของ MARSHA นี้">🏨 <b class="code">${esc(c.marsha)}</b>${pr&&pr.name?" "+esc(pr.name):""}</button>`:""}${c.location?`<span>📍 ${esc(c.location)}</span>`:""}<span>📅 ${thDate(c.date)} ${isToday?'<span class="todaytag">วันนี้</span>':""}</span></div>
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
  const sRow=s=>`<div class="staffrow">${avatar(s.id)}<span class="nm">${esc(s.name)}</span><select class="zsel" data-sz="${esc(s.id)}" aria-label="โซนของ ${esc(s.name)}">${zoneOpts(szone(s))}</select><button class="btn danger sm" data-rm="${esc(s.id)}">ลบ</button></div>`;
  const pRow=p=>`<div class="staffrow"><span class="code pc">${esc(p.code)}</span><span class="nm">${esc(p.name||"—")}</span><select class="zsel" data-pz="${esc(p.id)}" aria-label="โซนของ ${esc(p.code)}">${zoneOpts(p.zone||"1")}</select><button class="btn danger sm" data-rmp="${esc(p.id)}">ลบ</button></div>`;
  const grp=(list,row,emptyTxt)=>ZONES.map(z=>{
    const items=list.filter(x=>(x.zone||"1")===z);
    return `<div class="zgroup${z===curZone?" cur":""}"><h3 class="zh">Zone ${z} <span>${items.length}</span></h3>${items.length?items.map(row).join(""):`<div class="meta zempty">${emptyTxt}</div>`}</div>`}).join("");
  $("staffList").innerHTML=grp(staff,sRow,"ยังไม่มีสมาชิกในโซนนี้");
  $("propList").innerHTML=grp([...props].sort((a,b)=>a.code.localeCompare(b.code)),pRow,"ยังไม่มี MARSHA ในโซนนี้");
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
  const zone=c?czone(c):curZone;
  $("fZoneTxt").textContent="Zone "+zone;
  fillMarsha(zone,c?c.marsha||"":"");
  $("fNo").value=c?c.caseNo||"":"";$("fCat").value=(c&&c.category)||"Network";$("fLoc").value=c?c.location||"":"";$("fTitle").value=c?c.title:"";$("fDetail").value=c?c.detail||"":"";
  $("fDate").value=c?c.date:todayStr();$("fStatus").value=c?c.status:"กำลังดำเนินการ";
  fillStaffSelects();
  if(c&&c.owner&&!zoneStaff().some(s=>s.id===c.owner)&&staffById(c.owner))$("fOwner").innerHTML+=`<option value="${esc(c.owner)}">${esc(staffName(c.owner))} (นอกโซน)</option>`;
  $("fOwner").value=c?c.owner:(curMe()||(zoneStaff()[0]&&zoneStaff()[0].id)||"");
  renderMembers(c?mem(c):[]);syncMembers();
  [...$("fStatus").options].forEach(o=>{o.disabled=!!c&&c.status!=="เสร็จสิ้น"&&o.text==="เสร็จสิ้น"&&!inCaseOf(c,curMe())});
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
  const data={caseNo:$("fNo").value.trim(),title,detail:$("fDetail").value.trim(),date:$("fDate").value||todayStr(),status:$("fStatus").value,owner:$("fOwner").value,members:getMembers(),category:$("fCat").value,location:$("fLoc").value.trim(),zone:editing?czone(editing):curZone,marsha:$("fMarsha").value};
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
    if(old)await api("updateCase",old.id,data,curMe(),myName());
    else await api("addCase",data,curMe());
    ok=true;$("dlg").close();toast("บันทึกแล้ว");
  });
  $("save").disabled=false;
  if(!ok)return;
    if(old){const gone=(old.photos||[]).filter(p=>!(data.photos||[]).includes(p));if(gone.length)removeFiles(gone)}
  // ครั้งแรกที่ยังไม่ได้เลือก "ฉันคือ": ถามว่าจะจำคนที่เลือกเป็นชื่อของฉันไหม
  if(isNew&&!curMe()&&data.owner&&zoneStaff().some(x=>x.id===data.owner)&&confirm("ให้จำ \""+staffName(data.owner)+"\" เป็นชื่อของคุณ และตั้งเป็นค่าเริ่มต้นทุกครั้งที่เปิดเคสใหม่ไหม?")){
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
      try{
        const r=await api("checkPin",p);
        if(!r.ok){toast("PIN ไม่ถูกต้อง");return}
        adminPin=p;
        if(r.isDefault){   // ยังใช้ PIN เริ่มต้น 1234: บังคับให้ตั้งใหม่ก่อนเข้าหลังบ้าน
          const np=await askSecret(PIN_FORCED);
          if(!np){adminPin="";return}
          toast("เปลี่ยน PIN แล้ว หลังจากนี้ใช้ PIN ใหม่ของคุณ");
        }
      }catch(x){adminPin="";toast("ตรวจ PIN ไม่ได้ ลองใหม่");return}
    }
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b===t));
    $("casesView").hidden=t.dataset.t!=="cases";$("adminView").hidden=t.dataset.t!=="admin";
  }
  if(t.dataset.zone){setZone(t.dataset.zone);return}
  if(t.dataset.done||t.dataset.reopen){
    const id=t.dataset.done||t.dataset.reopen,c=cases.find(x=>x.id===id),m=curMe();if(!c)return;
    if(!m){toast("เลือกชื่อ \"ฉันคือ\" ในส่วนหัวก่อน");return}
    if(!inCaseOf(c,m)){toast("เฉพาะผู้รับผิดชอบหรือผู้ร่วมเคสนี้เท่านั้นที่ปิด/เปิดเคสได้");return}
    const done=!!t.dataset.done;
    if(done&&!confirm("ปิดเคส \""+c.title+"\" เป็น เสร็จสิ้น?"))return;
    t.disabled=true;await guard(async()=>{await api("setStatus",id,done?"เสร็จสิ้น":"กำลังดำเนินการ",m,myName());toast(done?"ปิดเคสแล้ว ✓":"เปิดเคสอีกครั้งแล้ว")});
    t.disabled=false;return;
  }
  if(t.dataset.marclear){$("fmar").value="";render();return}
  if(t.dataset.mar){const sel=$("fmar"),m=t.dataset.mar;if(![...sel.options].some(o=>o.value===m))sel.innerHTML+=`<option value="${esc(m)}">${esc(m)}</option>`;sel.value=m;$("fdate").value="";render();window.scrollTo({top:0,behavior:"smooth"});return}
  if(t.dataset.stat!==undefined){$("fstatus").value=t.dataset.stat;render();return}
  if(t.dataset.rmex){existing=existing.filter(p=>p!==t.dataset.rmex);renderPhotoEdit();return}
  if(t.dataset.rmpend!==undefined){pending.splice(+t.dataset.rmpend,1);renderPhotoEdit();return}
  if(t.dataset.join){if(!curMe()){toast("เลือกชื่อ \"ฉันคือ\" ในส่วนหัวก่อน (ต้องเป็นคนในโซนนี้)");return}
    t.disabled=true;await guard(async()=>{await api("toggleJoin",t.dataset.join,curMe(),myName());toast("อัพเดทผู้ร่วมเคสแล้ว")});t.disabled=false}
  if(t.dataset.edit)openDlg(cases.find(c=>c.id===t.dataset.edit));
  if(t.dataset.upd){const id=t.dataset.upd,inp=document.querySelector(`[data-draft="${id}"]`),v=inp.value.trim();if(!v)return;
    t.disabled=true;await guard(async()=>{await api("addLog",id,v,curMe(),myName());drafts[id]="";toast("เพิ่มอัพเดทแล้ว")});t.disabled=false}
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
["q","fdate","fowner","fstatus","fcat"].forEach(i=>$(i).addEventListener("input",render));
$("fmar").addEventListener("change",()=>{if($("fmar").value)$("fdate").value="";render()});
$("export").onclick=()=>exportExcel(false);
$("exportAll").onclick=()=>exportExcel(true);
$("logout").onclick=()=>{try{localStorage.removeItem("ghToken")}catch(e){}token="";toast("ล้างรหัสในเครื่องนี้แล้ว");setTimeout(()=>location.reload(),700)};
$("today").onclick=()=>{$("fdate").value=todayStr();render()};
$("all").onclick=()=>{$("fdate").value="";render()};
$("reload").onclick=()=>{refresh(true).then(()=>toast("อัพเดทข้อมูลล่าสุดแล้ว"))};
$("add").onclick=()=>openDlg(null);
$("fOwner").addEventListener("change",syncMembers);
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

// ================= Export Excel (.xlsx) : สร้างไฟล์เองในเบราว์เซอร์ ไม่ต้องใช้ไลบรารีภายนอก =================
const xe=s=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const colL=i=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
function sheetXml(sh){
  const rows=sh.rows,w=sh.widths||[];
  let x=XML+`<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  if(w.length)x+="<cols>"+w.map((v,i)=>`<col min="${i+1}" max="${i+1}" width="${v}" customWidth="1"/>`).join("")+"</cols>";
  x+="<sheetData>"+rows.map((r,ri)=>`<row r="${ri+1}">`+r.map((v,ci)=>{
    const ref=colL(ci)+(ri+1),st=ri===0?1:2;
    if(typeof v==="number")return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xe(v==null?"":v)}</t></is></c>`;
  }).join("")+"</row>").join("")+"</sheetData>";
  if(rows.length&&rows[0].length)x+=`<autoFilter ref="A1:${colL(rows[0].length-1)}${rows.length}"/>`;
  return x+"</worksheet>";
}
const STYLES=XML+`<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FF04121C"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF67E8F9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function makeZip(files){
  const enc=new TextEncoder(),parts=[],cent=[];let off=0;
  const d=new Date(),dt=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),dd=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const f of files){
    const name=enc.encode(f.name),data=enc.encode(f.text),crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,dt,true);lh.setUint16(12,dd,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),name,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,dt,true);ch.setUint16(14,dd,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);
    ch.setUint16(30,0,true);ch.setUint16(32,0,true);ch.setUint16(34,0,true);ch.setUint16(36,0,true);ch.setUint32(38,0,true);ch.setUint32(42,off,true);
    cent.push(new Uint8Array(ch.buffer),name);
    off+=30+name.length+data.length;
  }
  const csz=cent.reduce((a,b)=>a+b.length,0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,csz,true);end.setUint32(16,off,true);
  return new Blob([...parts,...cent,new Uint8Array(end.buffer)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
function makeXlsx(sheets){
  const n=sheets.length,files=[];
  files.push({name:"[Content_Types].xml",text:XML+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`+sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")+`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`});
  files.push({name:"_rels/.rels",text:XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`});
  files.push({name:"xl/workbook.xml",text:XML+`<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`+sheets.map((s,i)=>`<sheet name="${xe(s.name.replace(/[\[\]:*?\/\\]/g," ").slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")+`</sheets></workbook>`});
  files.push({name:"xl/_rels/workbook.xml.rels",text:XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")+`<Relationship Id="rId${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
  files.push({name:"xl/styles.xml",text:STYLES});
  sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,text:sheetXml(s)}));
  return makeZip(files);
}
const pad2=n=>String(n).padStart(2,"0");
const isoDT=t=>{const d=new Date(t);return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())+" "+pad2(d.getHours())+":"+pad2(d.getMinutes())};
function downloadBlob(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function buildBook(list,byCase,zonesScope){
  const mn=ids=>ids.map(staffName).join(", ");
  const caseRows=[["โซน","MARSHA","ชื่อโรงแรม","เลขเคส","วันที่","หมวดงาน","ชื่อเคส","รายละเอียด","สถานที่ภายใน","สถานะ","ผู้รับผิดชอบหลัก","ผู้ร่วมเคส","จำนวนรูป","อัพเดทล่าสุด","เวลาอัพเดทล่าสุด","สร้างเมื่อ"]];
  const logRows=[["โซน","MARSHA","เลขเคส","ชื่อเคส","เวลา","โดย","ข้อความ"]];
  list.forEach(c=>{
    const p=propOf(c.marsha),ls=byCase[c.id]||[],last=ls[ls.length-1];
    caseRows.push([("Zone "+czone(c)),c.marsha||"",p&&p.name||"",c.caseNo||"",c.date||"",c.category||"",c.title||"",c.detail||"",c.location||"",c.status||"",staffName(c.owner),mn(c.members||[]),(c.photos||[]).length,last?last.text:"",last?isoDT(last.at):"",c.createdAt?isoDT(c.createdAt):""]);
    ls.forEach(l=>logRows.push(["Zone "+czone(c),c.marsha||"",c.caseNo||"",c.title||"",isoDT(l.at),l.byName||"",l.text||""]));
  });
  const sumRows=[["โซน","MARSHA","ชื่อโรงแรม","เคสทั้งหมด","กำลังดำเนินการ","รอส่งต่อ","เสร็จสิ้น"]];
  zonesScope.forEach(z=>{
    const inZ=list.filter(c=>czone(c)===z);
    const codes=new Set(props.filter(p=>(p.zone||"1")===z).map(p=>p.code));
    inZ.forEach(c=>{if(c.marsha)codes.add(c.marsha)});
    const line=(label,name,arr)=>{const n=v=>arr.filter(c=>c.status===v).length;sumRows.push(["Zone "+z,label,name,arr.length,n("กำลังดำเนินการ"),n("รอส่งต่อ"),n("เสร็จสิ้น")])};
    [...codes].sort().forEach(code=>{const p=propOf(code);line(code,p&&p.name||"",inZ.filter(c=>c.marsha===code))});
    const none=inZ.filter(c=>!c.marsha);if(none.length)line("(ไม่ระบุ)","",none);
  });
  return makeXlsx([
    {name:"เคส",rows:caseRows,widths:[9,10,26,14,12,14,34,50,22,16,16,26,9,40,17,17]},
    {name:"ประวัติอัพเดท",rows:logRows,widths:[9,10,14,34,17,16,60]},
    {name:"สรุปตาม MARSHA",rows:sumRows,widths:[9,12,30,12,16,12,12]}
  ]);
}
function exportExcel(all){
  let list,byCase;
  if(all){
    list=[...cases].sort((a,b)=>czone(a).localeCompare(czone(b))||(a.marsha||"").localeCompare(b.marsha||"")||(b.date||"").localeCompare(a.date||""));
    byCase={};logs.forEach(l=>(byCase[l.caseId]=byCase[l.caseId]||[]).push(l));Object.values(byCase).forEach(a=>a.sort((x,y)=>x.at-y.at));
  }else{list=lastRows;byCase=lastByCase}
  if(!list.length){toast("ไม่มีเคสให้ส่งออก");return}
  const fm=$("fmar").value;
  const name="CaseLog_"+(all?"AllZones":"Zone"+curZone)+(!all&&fm&&fm!=="__none"?"_"+fm:"")+"_"+todayStr()+".xlsx";
  downloadBlob(buildBook(list,byCase,all?ZONES:[curZone]),name);
  toast("ส่งออก "+list.length+" เคส → "+name);
}

const pinValidate=v=>v.length<4?"PIN ต้องยาวอย่างน้อย 4 ตัว":v==="1234"?"ห้ามใช้ PIN เริ่มต้น (1234)":"";
const pinSave=async v=>{await api("setPin",adminPin,v);adminPin=v};
const PIN_FORCED={ico:"⚠️",forced:true,title:"กรุณาเปลี่ยน PIN หลังบ้าน",desc:"คุณกำลังใช้ PIN เริ่มต้น (1234) ซึ่งทุกคนรู้ กรุณาตั้ง PIN ใหม่ก่อนใช้งานหลังบ้าน หลังจากนี้จะใช้ PIN ที่คุณตั้งเท่านั้น",label:"PIN ใหม่",validate:pinValidate,save:pinSave};
$("changePin").onclick=async()=>{if(await askSecret({ico:"🔐",title:"เปลี่ยน PIN หลังบ้าน",desc:"ตั้ง PIN ใหม่สำหรับเข้าหลังบ้าน",label:"PIN ใหม่",validate:pinValidate,save:pinSave}))toast("เปลี่ยน PIN แล้ว")};
$("changeTeam").onclick=async()=>{
  if(!token){toast("ยังไม่ได้เข้าสู่ระบบ");return}
  const ok=await askSecret({ico:"🔑",title:"เปลี่ยนรหัสทีม",desc:"ตั้งรหัสทีมใหม่ ทุกคน (รวมถึงเครื่องที่เข้าอยู่แล้ว) จะต้องใส่รหัสใหม่ตอนเปิดเว็บครั้งถัดไป หลังเว็บอัพเดทประมาณ 1-2 นาที",label:"รหัสทีมใหม่",
    save:async v=>{if(isWeak(v)&&!confirm(WEAK_MSG))throw new Error("ตั้งรหัสที่ยาวขึ้นแล้วลองใหม่");const a=await encryptAuth(token,v);await putAuth(token,a);try{localStorage.setItem("ghRev",String(a.rev))}catch(e){}}});
  if(ok)toast("เปลี่ยนรหัสทีมแล้ว รอ 1-2 นาทีให้เว็บอัพเดท");
};
$("login").addEventListener("cancel",e=>e.preventDefault());   // หน้าเข้าสู่ระบบปิดข้ามไม่ได้
function tick(){const d=new Date();$("clock").textContent=d.toLocaleTimeString("th-TH",{hour12:false});$("nowDate").textContent=d.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
tick();setInterval(tick,1000);
refresh();
setInterval(()=>{if(token&&!document.hidden&&!$("dlg").open)refresh()},15000);
