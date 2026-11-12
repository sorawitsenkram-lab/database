// ★ ตั้งค่าที่เก็บข้อมูล (GitHub repo ที่มีไฟล์ data/data.json)
window.CONFIG = {
  OWNER:  "sorawitsenkram-lab",   // ชื่อผู้ใช้หรือองค์กรบน GitHub ที่เป็นเจ้าของ repo เก็บข้อมูล
  REPO:   "case-log",         // ชื่อ repo ที่เก็บข้อมูล (แนะนำให้เป็น private)
  BRANCH: "main",
  PATH:   "data/data.json",
  // SHA-256 ของ PIN หลังบ้าน (ค่าเริ่มต้นคือ 1234 เปลี่ยนตามวิธีใน README)
  ADMIN_PIN_SHA256: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"
};
