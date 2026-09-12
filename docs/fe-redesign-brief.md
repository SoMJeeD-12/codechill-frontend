# ออกแบบหน้าจอใหม่ — ให้เข้าใจง่ายตามที่พี่เลี้ยงต้องการ
> ใช้เฉพาะ API ที่ backend มีอยู่แล้ว (รายการอยู่ท้ายไฟล์) **ห้ามสมมติ endpoint ใหม่**
> ข้อไหนทำไม่ได้ด้วยของที่มี ให้จดลง `docs/be-requests.md` แทนการเดา

## ปัญหาที่ต้องแก้
พี่เลี้ยงดูระบบแล้วบอกว่า "ค่อนข้างซับซ้อน" "ตัวประกอบเยอะจนหาพระเอกไม่เจอ"
"งานย่อยคืออะไร การส่งมอบคืออะไร" — คือเปิดมาแล้วไม่รู้ว่าต้องเริ่มตรงไหน

## 5 หลักที่ใช้ตัดสินทุกหน้า
1. **แยกเมนู 3 ชั้น** — งานที่ทำทุกวัน / ข้อมูลที่ช่วยงานนั้น / ตั้งค่าที่นาน ๆ ใช้ที
2. **โปรเจคคือพระเอก** ลูกค้าเป็นข้อมูลรอง (ลูกค้า 1 รายมีหลายโปรเจค)
3. **ทำงานครั้งเดียวจบ** ไม่ต้องเด้งไปเมนูอื่นแล้วกลับมา
4. **ข้อมูลสำคัญอยู่บนสุดเสมอ**
5. **คิดแบบผู้ใช้ขี้เกียจ** — "เราไม่ได้ใช้ระบบนี้ คนใช้คือพนักงาน เขาแค่อยากให้มันง่ายและลื่น"

## เกณฑ์ที่ถือว่าออกแบบสำเร็จ
- งานที่ทำบ่อย 5 อย่างนี้ ต้องจบได้ใน **≤ 3 คลิกจากหน้าแรก** และ **ไม่ต้องเปลี่ยนเมนูกลางคัน**
  1) เปิดใบแจ้งปัญหาที่ลูกค้าเพิ่งโทรมา
  2) บันทึกผลการแก้ปัญหา
  3) สร้างโปรเจคใหม่ให้ลูกค้าใหม่
  4) บันทึกการส่งมอบ + ออกประกัน
  5) ตั้งงานติดตามลูกค้า
- เปิดหน้าแรกแล้วรู้ทันทีว่า "วันนี้ต้องทำอะไร"
- ทุกหน้ามี **ปุ่มหลักปุ่มเดียว** ที่เด่นกว่าปุ่มอื่น
- ช่องกรอกที่ไม่จำเป็นถูกพับไว้ (ดูหัวข้อ "ฟิลด์ที่ซ่อน")

## เมนูใหม่
**งานหลัก**
- หน้าแรก (รวม "งานของฉัน" ไว้ในนี้ — ไม่ต้องแยกเมนู)
- **โปรเจค**
- งาน (กระดาน)
- ปัญหา / ซัพพอร์ต
- ติดตามลูกค้า

**ข้อมูล**
- ลูกค้า
- มุมมองลูกค้า 360°
- การรับประกัน
- สัญญา MA
- แบบประเมิน
- รายงาน

**ตั้งค่า**
- ผู้ใช้ · บทบาท (เฉพาะ Super Admin) · แผน MA · ประวัติการใช้งาน

กติกาเรื่องคำ: ใช้ **"โปรเจค"** แทน "โครงการ" ทั้งหน้าจอ · **ห้ามมีคำว่า "รายได้" ที่ไหนเลย**
(กลุ่มเมนูเดิมชื่อ "รายได้ต่อเนื่อง" ต้องเปลี่ยน) ตัวเลขเงินทั้งหมดคือ "มูลค่าตามสัญญา"

## หน้าจอและสิ่งที่ผู้ใช้ต้องทำได้จบในหน้านั้น

### หน้าแรก
การ์ด "ต้องทำวันนี้" 4 ใบ กดแล้วไปรายการที่กรองไว้แล้ว: ปัญหารอแก้ · งานเลยกำหนด · ติดตามที่เลยกำหนด · ประกัน/MA ใกล้หมด
ถัดลงมาคือ "งานของฉัน" แยก 3 กลุ่ม: ปัญหาที่ฉันรับผิดชอบ / งานของฉัน / งานติดตามของฉัน
ปุ่มลัดมุมขวาบนทุกหน้า: **+ เปิดใบแจ้งปัญหา**, **+ บันทึกการติดต่อ** (พนักงานเพิ่งวางสายจากลูกค้าแล้วบันทึกได้ทันที)

### โปรเจค
- **รายการ**: รหัส · ชื่อ · ลูกค้า · สถานะ · ความคืบหน้า % · ผู้จัดการ · กำหนดส่ง (ไม่ต้องมีคอลัมน์มูลค่า)
- **สร้าง** (popup ใหญ่ 2 คอลัมน์): ชื่อโปรเจค ประเภท ความสำคัญ วันเริ่ม/กำหนดส่ง ผู้จัดการ + **ลูกค้าในฟอร์มเดียวกัน**
  - ช่องลูกค้า: ยังไม่พิมพ์ = ไม่แสดงอะไร พิมพ์ 2 ตัวอักษรค่อยค้น เลือกแล้วโชว์ข้อมูลลูกค้าให้เห็น
  - ถ้าเป็นลูกค้าใหม่: กรอกในฟอร์มเดียวกัน (ชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ เบอร์ อีเมล) + ผู้ติดต่อหลัก 1 คน
- **รายละเอียด**: หัวหน้าสรุป (รหัส ชื่อ ลูกค้า สถานะ ความคืบหน้า วันที่) แล้วแยกเป็นแท็บ
  `ส่งมอบ & ประกัน` · `เอกสาร` · `ปัญหาของโปรเจคนี้` · `งานติดตาม` · `สัญญา MA`
  - แท็บส่งมอบ: บันทึกส่งมอบ → ตรวจรับ (ถ้ายอมรับให้ถามในหน้าเดียวกันว่า "เป็นการส่งมอบครั้งสุดท้ายไหม") → ปุ่มออกประกันเปิดตาม `canIssueWarranty`
  - แท็บเอกสาร: ปุ่มเพิ่ม → ชื่อเอกสาร + แนบไฟล์ + รายละเอียด (ไม่มีช่องประเภทเอกสาร) · ดาวน์โหลดได้

### งาน (กระดาน)
คอลัมน์ตามสถานะ ลากการ์ดเปลี่ยนสถานะ กรองตามโปรเจค/ผู้รับผิดชอบ มีตัวเลขสรุปด้านบน
งานย่อยสร้าง/แก้จากหน้านี้ได้เลย ไม่ต้องกลับไปหน้าโปรเจค

### ปัญหา / ซัพพอร์ต
- **รายการ** 2 แท็บ: "รอรับการแก้ไข" (ค่าเริ่มต้น) กับ "ทั้งหมด" · ช่องค้นหาเดียวค้นได้ทั้ง เลขใบ หัวข้อ ชื่อลูกค้า ชื่อโปรเจค
- **เปิดใบ**: เลือกโปรเจค (ระบบเติมลูกค้าให้) หรือเลือกลูกค้าอย่างเดียว · หัวข้อ · รายละเอียด · ช่องทางที่แจ้ง · ความเร่งด่วน
  **ไม่ต้องเลือกผู้รับผิดชอบตอนรับเรื่อง** (พี่เลี้ยง: "พนักงานแค่รับเรื่อง ส่วนจะโยนงานให้ใครเป็นเรื่องของหัวหน้า")
- **รายละเอียด**: แถบสถานะปัจจุบันของใบ 1 แถบ (ไม่ซ้อนกับตาราง) + **รายการรอบการแก้ไข** คลิกรอบไหนเห็นรายละเอียดรอบนั้น
  (สาเหตุ วิธีแก้ ผลลัพธ์ ผู้แก้ เวลาที่ใช้ เวลาที่แก้เสร็จ)
- ปุ่ม: มอบหมาย · บันทึกผลการแก้ไข · ปัญหาเดิมกลับมา · ปิดงาน
- **"ปัญหาเดิมกลับมา" ต้องเริ่มจากค้นใบเดิมให้เจอ แล้วเปิดรอบใหม่ในใบเดิม ห้ามเปิดใบใหม่**

### ติดตามลูกค้า
งานที่ค้างนานสุดอยู่บนสุด · สร้างงานติดตามต้องเลือกโปรเจค (ระบบใช้ลูกค้าของโปรเจค)
ปิดงานแล้วเด้งถามต่อทันทีว่า "บันทึกการติดต่อเลยไหม"

### ลูกค้า
ทะเบียนลูกค้า — ชื่อ ภาษี ที่อยู่ ผู้ติดต่อ  
เรียงข้อมูล: ชื่อบริษัท + เลขผู้เสียภาษี + ที่อยู่ + หมายเหตุ → ผู้ติดต่อ → LINE/Facebook ล่างสุด  
มีประวัติการติดต่อในหน้าเดียวกัน (ช่องทาง วันเวลา ผู้คุย หัวข้อ สรุป)  
จากหน้ารายละเอียดมีปุ่ม「ดูมุมมอง 360° ของลูกค้ารายนี้」ข้ามไป `/app/customer-360/:id`

### มุมมองลูกค้า 360°
เมนูแยกจาก「ลูกค้า」ชัดเจน — เลือกลูกค้า 1 ราย แล้วดูโปรเจค ประกัน MA ปัญหา ติดตาม ในหน้าเดียว

### ประกัน / สัญญา MA / แบบประเมิน / รายงาน / ตั้งค่า
ทำตามรายการ API ท้ายไฟล์ · หน้าผู้ใช้เลือกบทบาทได้ **อันเดียว** (dropdown ไม่ใช่ติ๊กหลายอัน)

## กติกาการแสดงผลที่ห้ามพลาด
- กั้นเมนู/ปุ่มด้วย `permissions` จาก `/api/auth/me` เท่านั้น **ห้ามใช้ `roles`** (Super Admin/Admin มี roles ว่าง)
- **ห้ามคำนวณสถานะเองจากวันที่** ใช้ flag จาก API: `isOverdue` · `isCurrentlyActive` · `isCurrentlyUsable` · `isPending` · `canIssueWarranty`
- ตารางทุกตัว: เลือกแถวต่อหน้า 10/20/50/100 (`limit` สูงสุด 100) + มีคอลัมน์รหัส (ค่าว่างแสดง "—")
- ช่องค้นหาแบบเลือกข้อมูล: เริ่มค้นที่ 2 ตัวอักษร หน่วง 300ms
- เงินมาเป็น string เช่น `"20000.00"` แสดงเป็น ฿20,000 ห้ามแปลงเป็น number ก่อนส่งกลับ
- ค่าที่ยังไม่กรอก (ชั่วโมง/ค่าบริการ) แสดง "ยังไม่กรอก" **ห้ามแสดง 0**
- หน้ารายงานต้องโชว์ `disclaimer` ที่ API ส่งมาเสมอ
- error: แสดง `message` จาก API ตรง ๆ (ไทยอยู่แล้ว) ห้ามกลืนเงียบ
- รูปแบบ response: `{ success, data, message }` · รายการ: `data: { items, total, page, limit }`
- ดาวน์โหลดไฟล์ต้องแนบ Authorization header → ดึงเป็น blob ไม่ใช้ `<a href>`

## ฟิลด์ที่ซ่อนไว้ (ตกลงกันแล้ว — ห้ามเอากลับมาโชว์)
ลูกค้า: ประเภทธุรกิจ จังหวัด รหัสไปรษณีย์ เว็บไซต์ ที่มา
พนักงาน: รหัสพนักงาน รูป ตำแหน่ง LINE ID
โปรเจค: จำนวนฟังก์ชัน
(ส่วน **รหัส** ทุกชนิดกลับมาแสดงแล้ว แต่ยังไม่บังคับกรอก)

## API ที่มีอยู่จริงทั้งหมด (ใช้ได้เท่านี้)
| กลุ่ม | endpoint | พารามิเตอร์ที่ใช้ได้ |
|---|---|---|
| auth | `POST /api/auth/login` · `POST /api/auth/refresh` · `POST /api/auth/logout` · `GET /api/auth/me` | — |
| โปรเจค | `GET/POST /api/projects` · `GET/PUT /api/projects/:id` | `search`, `status`, `customerId`, `priority`, `managerUserId`, `page`, `limit`, `sortBy`, `sortOrder` · สร้างส่ง `customerId` **หรือ** `newCustomer` |
| งานย่อย | `GET/POST /api/projects/:id/tasks` · `PUT/DELETE /api/projects/:id/tasks/:taskId` · `GET /api/tasks` · `GET /api/tasks/summary` · `GET /api/tasks/due-soon` · `GET /api/tasks/overdue` · `PATCH /api/tasks/:id/status` · `PATCH /api/tasks/:id/order` | `projectId`, `assignedUserId`, `status`, `priority`, `search`, `withinDays` |
| ส่งมอบ | `GET/POST /api/projects/:id/deliveries` · `GET/PUT /api/deliveries/:id` · `PATCH /api/deliveries/:id/acceptance` | acceptance ส่ง `{ acceptanceStatus, isFinal, acceptedByContactId, note }` |
| ประกัน | `POST /api/deliveries/:id/warranties` · `GET /api/projects/:id/warranties` · `GET /api/warranties/expiring` · `GET/PUT /api/warranties/:id` | expiring: `days` (1–365, ค่าเริ่มต้น 30), `customerId` |
| เอกสาร | `GET/POST /api/projects/:id/documents` · `GET/PATCH/DELETE /api/documents/:id` · `GET /api/documents/:id/download` | อัปโหลดเป็น multipart: `file`, `title`, `note` · ไม่เกิน 20 MB |
| ปัญหา | `GET /api/tickets` · `GET /api/tickets/pending` · `GET /api/tickets/:id` · `POST /api/tickets` · `PATCH /api/tickets/:id` · `PATCH /api/tickets/:id/assign` · `POST /api/tickets/:id/resolutions` · `PATCH /api/tickets/:id/reopen` · `PATCH /api/tickets/:id/close` | `search`, `status`, `customerId`, `projectId`, `priority`, **`assigneeId`**, `billingType` |
| ลูกค้า | `GET/POST /api/customers` · `GET/PUT/DELETE /api/customers/:id` · `GET /api/customers/:id/overview` | `search`, `status`, `ownerUserId`, `idleDays` |
| ผู้ติดต่อ | `GET/POST /api/contacts` · `PUT/DELETE /api/contacts/:id` | `customerId`, `isPrimary`, `search` |
| บันทึกการติดต่อ | `GET/POST /api/communication-logs` · `GET/PUT/DELETE /api/communication-logs/:id` | `customerId`, `contactId`, `channel`, `handledByUserId`, `dateFrom`, `dateTo` |
| ติดตาม | `GET/POST /api/follow-ups` · `GET/PATCH/DELETE /api/follow-ups/:id` · `PATCH /api/follow-ups/:id/complete` | `customerId`, **`projectId`**, `assignedUserId`, `status`, `overdue`, `dueFrom`, `dueTo`, `search` |
| MA | `GET/POST /api/ma-plans` · `GET/PUT/DELETE /api/ma-plans/:id` · `GET/POST /api/ma-contracts` · `GET/PUT /api/ma-contracts/:id` · `POST /api/ma-contracts/:id/renew` · `GET /api/ma-contracts/:id/quota` · `GET /api/ma-contracts/:id/print` · `GET/POST /api/ma-contracts/:id/addons` | contracts: `customerId`, `projectId`, `status`, `search` |
| แบบประเมิน | `GET/POST /api/surveys` · `GET/PATCH/DELETE /api/surveys/:id` · `PATCH /api/surveys/:id/status` · `GET /api/surveys/:id/summary` · `GET /api/surveys/:id/score-breakdown` · `GET/POST /api/surveys/:id/assignments` · `GET /api/surveys/:id/responses` · `POST /api/survey-assignments/:id/response` | assignments ส่ง `customerId`, `contactId`, `projectId` |
| รายงาน | `GET /api/reports/contract-value/by-customer` · `/by-type` · `/upcoming` · `GET /api/reports/service-cost` · `GET /api/reports/ma-contract-overlaps` | `dateFrom`, `dateTo`, `limit` |
| ผู้ใช้/สิทธิ์ | `GET/POST /api/users` · `PUT /api/users/:id` · `PUT /api/users/:id/roles` · `PATCH /api/users/:id/status` · `PATCH /api/users/me/password` · `GET /api/users/assignable` · `GET /api/roles` · `GET /api/roles/assignable` · `POST/PUT /api/roles/:id` · `PUT /api/roles/:id/permissions` · `GET /api/permissions` · `GET /api/audit-logs` | roles: ส่ง `roleIds` ได้ไม่เกิน 1 |

## สิ่งที่ backend ยังไม่มี — ห้ามทำเหมือนใช้ได้จริง
สถานะ "ส่งงานให้ผู้รับผิดชอบแล้ว" · หมวดหมู่ปัญหา · เตือนโควตา MA ตอนเปิดใบ · ประกันผูกแผน MA ·
รายงานรายโปรเจค · พิมพ์ใบยืนยันการแก้ไข · รหัสอัตโนมัติ · timeline วันที่รายรอบ · แจ้งเตือน (กระดิ่ง)
→ ให้ซ่อนไว้ หรือทำเป็น mock ที่ติดป้าย "ตัวอย่าง" ชัดเจน **และจดลง `docs/be-requests.md`**
