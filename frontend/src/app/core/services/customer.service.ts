import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  CommunicationChannel,
  CommunicationLog,
  Contact,
  Customer,
  CustomerStatus,
} from '../models/customer.model';

const CUSTOMERS_KEY = 'cpams_mock_customers';
const CONTACTS_KEY = 'cpams_mock_contacts';
const LOGS_KEY = 'cpams_mock_comm_logs';

const SEED_CUSTOMERS: Customer[] = [
  {
    id: 1,
    name: 'บริษัท แสงตะวัน เทคโนโลยี จำกัด',
    taxId: '0105558123456',
    address: '99 ถ.พระราม 9 แขวงบางกะปิ เขตห้วยขวาง กรุงเทพฯ',
    businessType: 'ซอฟต์แวร์และ IoT',
    status: 'ACTIVE',
    lifetimeValue: 1850000,
    createdAt: '2025-01-10T09:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 2,
    name: 'หจก. นครอินดัสทรี',
    taxId: '0125567009988',
    address: '12 หมู่ 3 อ.เมือง จ.นครราชสีมา',
    businessType: 'โรงงานอุตสาหกรรม',
    status: 'ACTIVE',
    lifetimeValue: 920000,
    createdAt: '2025-03-20T09:00:00.000Z',
    updatedAt: '2026-07-15T10:00:00.000Z',
  },
  {
    id: 3,
    name: 'บริษัท ดิจิทัลฟาร์ม จำกัด',
    taxId: '0105566111222',
    address: '88 ถ.พหลโยธิน จ.เชียงใหม่',
    businessType: 'เกษตรอัจฉริยะ',
    status: 'NEW',
    lifetimeValue: 150000,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
  },
  {
    id: 4,
    name: 'บริษัท โอเชียน คอนซัลท์ จำกัด',
    taxId: '0105544332211',
    address: '15 ถ.สุขุมวิท คลองเตย กรุงเทพฯ',
    businessType: 'ที่ปรึกษา',
    status: 'INACTIVE',
    lifetimeValue: 430000,
    createdAt: '2024-05-01T09:00:00.000Z',
    updatedAt: '2025-12-01T10:00:00.000Z',
  },
];

const SEED_CONTACTS: Contact[] = [
  {
    id: 1,
    customerId: 1,
    fullName: 'คุณอรรถพล ใจดี',
    position: 'IT Manager',
    phone: '081-111-2222',
    email: 'attapon@sangtawan.co.th',
    isPrimary: true,
  },
  {
    id: 2,
    customerId: 1,
    fullName: 'คุณพิมพ์ใจ รักงาน',
    position: 'Procurement',
    phone: '082-333-4444',
    email: 'pimjai@sangtawan.co.th',
    isPrimary: false,
  },
  {
    id: 3,
    customerId: 2,
    fullName: 'คุณสมบัติ ช่างใหญ่',
    position: 'โรงงาน / ซ่อมบำรุง',
    phone: '089-555-6666',
    email: 'sombat@nakornind.com',
    isPrimary: true,
  },
  {
    id: 4,
    customerId: 3,
    fullName: 'คุณนิดา กรีน',
    position: 'ผู้ก่อตั้ง',
    phone: '086-777-8888',
    email: 'nida@digitalfarm.co.th',
    isPrimary: true,
  },
];

const SEED_LOGS: CommunicationLog[] = [
  {
    id: 1,
    customerId: 1,
    channel: 'LINE',
    summary: 'คุยเรื่องต่อสัญญา MA ประจำปี และนัดส่งใบเสนอราคา',
    contactedAt: '2026-08-28T14:30:00.000Z',
    createdByName: 'วิชัย ซัพพอร์ต',
    attachmentName: 'line-chat-0828.png',
  },
  {
    id: 2,
    customerId: 1,
    channel: 'PHONE',
    summary: 'แจ้งปัญหาเซ็นเซอร์ที่ไซต์ไม่ส่งข้อมูล — เปิด ticket แล้ว',
    contactedAt: '2026-09-01T10:15:00.000Z',
    createdByName: 'วิชัย ซัพพอร์ต',
    attachmentName: null,
  },
  {
    id: 3,
    customerId: 2,
    channel: 'ONSITE',
    summary: 'เข้าพบหน้างาน ตรวจรับมอบเฟสถัดไป',
    contactedAt: '2026-07-10T09:00:00.000Z',
    createdByName: 'สมหญิง ผู้ดูแลระบบ',
    attachmentName: 'site-photo.jpg',
  },
];

export interface CustomerInput {
  name: string;
  taxId: string;
  address: string;
  businessType: string;
  status: CustomerStatus;
  lifetimeValue: number;
}

export interface ContactInput {
  fullName: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface LogInput {
  channel: CommunicationChannel;
  summary: string;
  contactedAt: string;
  createdByName: string;
  attachmentName: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly customersSignal = signal<Customer[]>(this.load(CUSTOMERS_KEY, SEED_CUSTOMERS));
  private readonly contactsSignal = signal<Contact[]>(this.load(CONTACTS_KEY, SEED_CONTACTS));
  private readonly logsSignal = signal<CommunicationLog[]>(this.load(LOGS_KEY, SEED_LOGS));

  private nextCustomerId = this.maxId(this.customersSignal()) + 1;
  private nextContactId = this.maxId(this.contactsSignal()) + 1;
  private nextLogId = this.maxId(this.logsSignal()) + 1;

  readonly customers = this.customersSignal.asReadonly();
  readonly customerCount = computed(() => this.customersSignal().length);

  listCustomers(): Observable<Customer[]> {
    return of(structuredClone(this.customersSignal())).pipe(delay(250));
  }

  getCustomer(id: number): Customer | undefined {
    return this.customersSignal().find((c) => c.id === id);
  }

  createCustomer(input: CustomerInput): Observable<Customer> {
    if (!input.name.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อลูกค้า'));
    }
    const now = new Date().toISOString();
    const customer: Customer = {
      id: this.nextCustomerId++,
      name: input.name.trim(),
      taxId: input.taxId.trim(),
      address: input.address.trim(),
      businessType: input.businessType.trim(),
      status: input.status,
      lifetimeValue: Number(input.lifetimeValue) || 0,
      createdAt: now,
      updatedAt: now,
    };
    this.customersSignal.update((list) => {
      const next = [customer, ...list];
      this.save(CUSTOMERS_KEY, next);
      return next;
    });
    return of(structuredClone(customer)).pipe(delay(300));
  }

  updateCustomer(id: number, input: CustomerInput): Observable<Customer> {
    const current = this.getCustomer(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบลูกค้า'));
    }
    const updated: Customer = {
      ...current,
      name: input.name.trim(),
      taxId: input.taxId.trim(),
      address: input.address.trim(),
      businessType: input.businessType.trim(),
      status: input.status,
      lifetimeValue: Number(input.lifetimeValue) || 0,
      updatedAt: new Date().toISOString(),
    };
    this.customersSignal.update((list) => {
      const next = list.map((c) => (c.id === id ? updated : c));
      this.save(CUSTOMERS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(300));
  }

  getContacts(customerId: number): Contact[] {
    return this.contactsSignal().filter((c) => c.customerId === customerId);
  }

  saveContact(customerId: number, input: ContactInput, contactId?: number): Observable<Contact> {
    if (!input.fullName.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อผู้ติดต่อ'));
    }

    if (contactId) {
      const updated: Contact = {
        id: contactId,
        customerId,
        fullName: input.fullName.trim(),
        position: input.position.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        isPrimary: input.isPrimary,
      };
      this.contactsSignal.update((list) => {
        let next = list.map((c) => (c.id === contactId ? updated : c));
        if (input.isPrimary) {
          next = next.map((c) =>
            c.customerId === customerId && c.id !== contactId ? { ...c, isPrimary: false } : c
          );
        }
        this.save(CONTACTS_KEY, next);
        return next;
      });
      return of(structuredClone(updated)).pipe(delay(250));
    }

    const created: Contact = {
      id: this.nextContactId++,
      customerId,
      fullName: input.fullName.trim(),
      position: input.position.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      isPrimary: input.isPrimary,
    };
    this.contactsSignal.update((list) => {
      let next = [...list, created];
      if (input.isPrimary) {
        next = next.map((c) =>
          c.customerId === customerId && c.id !== created.id ? { ...c, isPrimary: false } : c
        );
      }
      this.save(CONTACTS_KEY, next);
      return next;
    });
    return of(structuredClone(created)).pipe(delay(250));
  }

  removeContact(contactId: number): Observable<void> {
    this.contactsSignal.update((list) => {
      const next = list.filter((c) => c.id !== contactId);
      this.save(CONTACTS_KEY, next);
      return next;
    });
    return of(void 0).pipe(delay(200));
  }

  getLogs(customerId: number): CommunicationLog[] {
    return this.logsSignal()
      .filter((l) => l.customerId === customerId)
      .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
  }

  addLog(customerId: number, input: LogInput): Observable<CommunicationLog> {
    if (!input.summary.trim()) {
      return throwError(() => new Error('กรุณาระบุสรุปการติดต่อ'));
    }
    const log: CommunicationLog = {
      id: this.nextLogId++,
      customerId,
      channel: input.channel,
      summary: input.summary.trim(),
      contactedAt: input.contactedAt || new Date().toISOString(),
      createdByName: input.createdByName,
      attachmentName: input.attachmentName,
    };
    this.logsSignal.update((list) => {
      const next = [log, ...list];
      this.save(LOGS_KEY, next);
      return next;
    });
    return of(structuredClone(log)).pipe(delay(250));
  }

  private load<T>(key: string, seed: T[]): T[] {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T[];
      }
    } catch {
      /* ignore */
    }
    const data = structuredClone(seed);
    this.save(key, data);
    return data;
  }

  private save<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
