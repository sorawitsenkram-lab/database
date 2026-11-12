# สมุดบันทึกเคสประจำวัน (ฐานข้อมูลอยู่ใน GitHub ล้วนๆ)

ไม่ต้องใช้บริการอื่นเลย: หน้าเว็บอยู่บน GitHub Pages ส่วนข้อมูลเก็บเป็นไฟล์ `data/data.json` ใน GitHub repo
หน้าเว็บอ่าน/เขียนไฟล์นี้ผ่าน GitHub API ทุกการบันทึกเป็น 1 commit จึงมีประวัติย้อนหลังและสำรองข้อมูลในตัว

## เลือกวิธีวาง (เลือก 1 แบบ)
**แบบ A (แนะนำ ข้อมูลเป็นส่วนตัว): 2 repo**
- repo `case-log` (Public) เก็บหน้าเว็บ: `index.html`, `style.css`, `app.js`, `config.js` และเปิด GitHub Pages
- repo `case-data` (**Private**) เก็บข้อมูล: อัปโหลดโฟลเดอร์ `data/` ที่มี `data.json`
- ใน `config.js` ให้ `REPO` ชี้ไปที่ `case-data`

**แบบ B (ง่ายสุด): repo เดียว** อัปโหลดทุกอย่างที่ root ของ repo เดียว
⚠️ ถ้า repo เป็น Public ทุกคนบนอินเทอร์เน็ตจะอ่าน `data/data.json` (ข้อมูลเคสทั้งหมด) ได้ ใช้แบบนี้เมื่อข้อมูลไม่เป็นความลับเท่านั้น
(repo Private + GitHub Pages ใช้ได้เฉพาะบัญชีแบบเสียเงิน)

## ขั้นตอน
1. สร้าง repo ตามแบบที่เลือก แล้วอัปโหลดไฟล์
2. เปิด Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`** ที่ repo หน้าเว็บ
3. แก้ `config.js`: ใส่ `OWNER` (ชื่อผู้ใช้ GitHub) และ `REPO` (repo เก็บข้อมูล)
4. สร้าง **Token** สำหรับทีม:
   GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: **Only select repositories** → เลือก repo เก็บข้อมูล
   - Permissions → Repository permissions → **Contents: Read and write**
   - ตั้งวันหมดอายุตามต้องการ แล้ว Generate คัดลอกเก็บไว้
5. เปิดลิงก์เว็บ (`https://<ชื่อผู้ใช้>.github.io/<repo>/`) วาง Token ในช่องที่ขึ้นมาครั้งแรก (เครื่องจะจำไว้)
6. เข้า "🔒 หลังบ้าน" ใส่ PIN (ค่าเริ่มต้น `1234`) เพื่อเพิ่มรายชื่อทีม

## เรื่องสำคัญ
- **ห้ามใส่ Token ลงในไฟล์ใดๆ บน GitHub** (GitHub จะยกเลิก Token อัตโนมัติ) ให้แต่ละคนวางตอนเปิดเว็บเท่านั้น ส่ง Token ให้ทีมผ่านช่องทางส่วนตัว
- ใครมี Token คือแก้ข้อมูลได้ทั้งหมด PIN หลังบ้านเป็นแค่ตัวกันกดผิดบนหน้าเว็บ ไม่ใช่ระบบความปลอดภัยจริง ถ้า Token รั่ว ให้ Revoke แล้วสร้างใหม่
- เปลี่ยน PIN: เปิดเว็บ กด F12 → Console วางโค้ดนี้ (แก้ `PINใหม่`) แล้วนำค่าที่ได้ไปใส่ `ADMIN_PIN_SHA256` ใน `config.js`
  `crypto.subtle.digest("SHA-256",new TextEncoder().encode("PINใหม่")).then(b=>console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")))`
- ถ้ามีคนบันทึกพร้อมกัน ระบบอ่านข้อมูลล่าสุดแล้วบันทึกซ้ำให้อัตโนมัติ จึงไม่ทับกัน
- หน้าเว็บเช็กข้อมูลใหม่ทุก 15 วินาที (ใช้โควตา API น้อยมาก) หรือกด "↻ รีเฟรช"
- ไฟล์ข้อมูลควรไม่เกิน 1 MB (ประมาณหลายพันเคส) ถ้าใหญ่กว่านั้นควรย้ายไปใช้ฐานข้อมูลจริง
- ดูประวัติ/ย้อนข้อมูลได้ที่แท็บ Commits ของ repo เก็บข้อมูล
