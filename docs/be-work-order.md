# คำสั่งงาน Backend

Base: `/api`

**ไม่รวม:** R2 · LINE · เรื่องที่รอพี่เลี้ยงตัดสิน (เช่น ASSIGNED status, หมวดหมู่ปัญหา, โควตาหลายประเภท, กระดิ่งแจ้งเตือน, DELETE)

อัปเดต: 14 ก.ย. 2569

**พี่เลี้ยงยืนยันแล้ว:** รหัสออกอัตโนมัติทั้งหมด — รูปแบบ `CUS` / `PRJ` / `TK` / `MA` / `WAR` / `DLV` (ดู §0)

---

## 0. รหัสอัตโนมัติ

Backend เป็นผู้สร้างรหัสและเป็น source of truth · **FE ห้าม generate**

### รูปแบบ

| Entity | ฟิลด์ | ตัวอย่าง |
|---|---|---|
| ลูกค้า | `code` | `CUS-001` |
| โปรเจกต์ | `code` | `PRJ-2026-001` |
| Ticket | `ticketNo` | `TK-2026-001` |
| MA Contract | `contractNo` | `MA-2026-001` |
| Warranty | `code` / `warrantyNo` | `WAR-2026-001` |
| Delivery | `deliveryNo` | `DLV-PRJ-2026-001-01` |

### ข้อกำหนด Backend

- ออกอัตโนมัติตอนสร้าง · ไม่รับรหัสจาก FE ใน create/update
- คืนค่าใน response ของ create และ GET
- `?search=` ต้องค้นด้วยรหัสได้
- ข้อมูลเก่าอาจเป็น `null` / รูปแบบเดิมได้ระหว่างทยอยปรับ

### FE (ทำแล้ว)

- ตัดช่องกรอกรหัสจากฟอร์มสร้าง/แก้ไขทุก entity ที่เกี่ยวข้อง
- หลังสร้างสำเร็จ แสดงรหัสที่ Backend คืนมา (snackbar + ตาราง/รายละเอียด)
- ค้นหาด้วยรหัสผ่าน `search` ตาม API เดิม
- ค่าว่างแสดง `—` · ไม่ generate ที่ FE

---

## 0b. ผลลัพธ์รอบแก้ไข · PARTIAL / FAILED ยังไม่จบ

พี่เลี้ยง / Product: 「สำเร็จบางส่วน」แปลว่ายังไม่จบ อาจส่งต่อให้อีกคนทำต่อ แล้วค่อยบันทึกรอบ「สำเร็จ」ภายหลัง

### ข้อกำหนด Backend (`POST /tickets/:id/resolutions`)

| `result` | สถานะใบหลังบันทึก |
|---|---|
| `SUCCESS` | → `RESOLVED` (รอปิดงาน) |
| `PARTIAL` | คง `IN_PROGRESS` (ห้ามดันเป็น RESOLVED) |
| `FAILED` | คง `IN_PROGRESS` (ห้ามดันเป็น RESOLVED) |

เพิ่มเติม:
- `PATCH /tickets/:id/close` ได้เฉพาะเมื่อรอบล่าสุดเป็น `SUCCESS` (หรือสถานะเป็น `RESOLVED` จริง)
- ไม่ต้องแก้ผลรอบเดิมย้อนหลัง — ทำต่อ = เพิ่มรอบใหม่
- รองรับเปลี่ยนผู้รับผิดชอบระหว่างที่ยัง IN_PROGRESS (มี `PATCH …/assign` อยู่แล้ว)

### FE (ทำแล้ว · overlay ชั่วคราวจนกว่า BE พร้อม)

- ถ้า API ยังดัน RESOLVED หลัง PARTIAL/FAILED → FE โชว์เป็น「ยังทำต่อ」และไม่ให้ปิดงาน
- ฟอร์มรอบแก้มีคำอธิบายผลลัพธ์ + ช่อง「ส่งต่องานให้」เมื่อเลือก PARTIAL/FAILED

---

## 1. Timeline ใบแจ้งปัญหา

เพิ่ม `GET /tickets/:id/timeline`

### Response

```json
{
  "items": [
    {
      "id": "string",
      "at": "ISO8601",
      "type": "REPORTED|ASSIGNED|STARTED|RESOLUTION|RESOLVED|REOPENED|CLOSED",
      "label": "string",
      "detail": "string|null"
    }
  ]
}
```

### ข้อกำหนด

- รวบรวมจากข้อมูล ticket, ticket resolutions และ audit log ที่มีอยู่
- หาก event ใดยังไม่มีข้อมูลเฉพาะ ให้คืนตามข้อมูลที่พิสูจน์ได้จริง
- **ห้ามสร้างวันที่สมมติ**

---

## 2. รายงานรายโปรเจกต์

เพิ่ม `GET /projects/:id/report`

### Response

```json
{
  "projectId": 1,
  "progressPercent": 0,
  "ticketCount": 0,
  "openTicketCount": 0,
  "deliveryCount": 0,
  "maContractCount": 0,
  "warrantyCount": 0,
  "disclaimer": "string|null"
}
```

### ข้อกำหนด

- ตรวจสิทธิ์ให้สอดคล้องกับการดูข้อมูลโปรเจกต์

---

## 3. พิมพ์ใบยืนยันการแก้ไข

เพิ่ม `GET /tickets/:id/resolutions/:resolutionId/print`

### คืนข้อมูลสำหรับ FE ใช้พิมพ์

- เลขใบแจ้งปัญหา
- ลูกค้า
- โปรเจกต์
- รอบการแก้ไข
- สาเหตุ / วิธีแก้ / ผลการแก้
- วันเวลา
- ผู้แก้ไข

### ข้อกำหนด

- **ไม่ต้อง**สร้าง PDF หรือจัด layout ใน Backend

---

## 4. Admin รีเซ็ตรหัสผ่าน

เพิ่ม `POST /users/:id/reset-password`

### Body

```json
{
  "newPassword": "string"
}
```

### ข้อกำหนด

- จำกัดเฉพาะ `ADMIN` และ `SUPER_ADMIN`
- hash รหัสผ่านก่อนบันทึก
- ล้าง refresh token เดิมของผู้ใช้นั้น เพื่อบังคับ login ใหม่
- บันทึก audit log
- คง `PATCH /users/me/password` เดิมไว้

---

## 5. ไฟล์แนบต่อ entity — ออกแบบ metadata/API ก่อน

เพิ่มความสามารถ CRUD/list สำหรับ metadata ของไฟล์แนบที่ผูกกับ:

- Ticket
- TicketResolution
- CommunicationLog
- MaContract
- Delivery

### รูปแบบ response

```json
{
  "id": 1,
  "fileName": "string",
  "mimeType": "string",
  "sizeBytes": 0,
  "downloadUrl": "string",
  "uploadedAt": "ISO8601",
  "uploadedByUserId": 1
}
```

### ข้อกำหนด

- **ห้าม**ผูก implementation กับ R2 ในงานนี้
- ออกแบบให้ใช้ `StorageService` กลางได้ภายหลัง
