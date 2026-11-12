# สมุดบันทึกเคสประจำวัน (GitHub Pages + Supabase)

ไฟล์ในชุดนี้
- `index.html`, `style.css`, `app.js` : หน้าเว็บ (วางบน GitHub Pages)
- `config.js` : ใส่ URL และ key ของ Supabase
- `schema.sql` : สร้างฐานข้อมูล (ตาราง + ฟังก์ชัน + ระบบป้องกัน)

## 1) สร้างฐานข้อมูล (ฟรี)
1. สมัคร/เข้า https://supabase.com แล้วสร้าง Project ใหม่ (ตั้งรหัสผ่านฐานข้อมูลเก็บไว้)
2. เมนู **SQL Editor → New query** วางโค้ดทั้งไฟล์ `schema.sql`
3. ก่อนกด Run แก้ `change-me-team` (รหัสทีม) และ `1234` (PIN หลังบ้าน) เป็นของคุณ
4. กด **Run** ต้องขึ้น Success

## 2) ตั้งค่าหน้าเว็บ
1. ใน Supabase ไปที่ **Project Settings → API** คัดลอก **Project URL** และ **anon / publishable key**
2. เปิด `config.js` วางสองค่านั้นแทนข้อความตัวอย่าง

## 3) ขึ้น GitHub Pages
1. สร้าง repository ใหม่บน GitHub แล้วอัปโหลดไฟล์ `index.html`, `style.css`, `app.js`, `config.js`
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**
3. รอ 1-2 นาที ได้ลิงก์ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ repo>/`
4. เปิดลิงก์ ใส่รหัสทีม แล้วเข้า "🔒 หลังบ้าน" ใส่ PIN เพื่อเพิ่มรายชื่อทีม

## ความปลอดภัย
- ตารางทั้งหมดปิดการเข้าถึงโดยตรง อ่านเขียนได้ผ่านฟังก์ชันที่ตรวจรหัสทีมเท่านั้น
- anon key เปิดเผยในเว็บได้ตามการออกแบบของ Supabase แต่รหัสทีมและ PIN อยู่ในฐานข้อมูล ห้ามใส่ลงไฟล์บน GitHub
- ถ้ามีคนออกจากทีม เปลี่ยนรหัสด้วย: `update settings set value='รหัสใหม่' where key='team_key';` ใน SQL Editor
- เหมาะกับทีมเล็ก ถ้าเคสมีข้อมูลส่วนบุคคลสำคัญ ควรใช้ระบบล็อกอินรายบุคคลแทนรหัสร่วม
- หน้าเว็บดึงข้อมูลใหม่ทุก 15 วินาที หรือกดปุ่ม "↻ รีเฟรช"
