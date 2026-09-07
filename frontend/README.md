# CPAMS Frontend

Angular frontend สำหรับระบบบริหารจัดการลูกค้า โครงการ และบริการหลังการขาย  
**เฟส 0:** Layout + Login + สิทธิ์เมนูด้วยข้อมูล mock (ยังไม่เชื่อม backend)

## เริ่มใช้งาน

```bash
cd frontend
npm start
```

เปิด [http://localhost:4200](http://localhost:4200)

## บัญชีทดลอง

รหัสผ่านทุกบัญชี: `password`

| Username | ระดับ | เมนูที่เห็น |
|----------|--------|-------------|
| `superadmin` | Super Admin | ทุกเมนู |
| `admin` | Admin | ทุกเมนู |
| `support` | User (ซัพพอร์ต) | ตามบทบาทซัพพอร์ต |
| `multi` | User (หลายบทบาท) | ซัพพอร์ต + การตลาด |

## โครงสร้างหลัก

- `src/app/core` — auth, guards, layout, mock data
- `src/app/features` — หน้าจอแต่ละโมดูล
- `src/app/shared` — คอมโพเนนต์ใช้ร่วมกัน
