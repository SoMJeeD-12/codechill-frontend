import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  Delivery,
  DeliveryAcceptance,
  Project,
  ProjectStatus,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../models/project.model';

const PROJECTS_KEY = 'cpams_mock_projects';
const TASKS_KEY = 'cpams_mock_tasks';
const DELIVERIES_KEY = 'cpams_mock_deliveries';

const SEED_PROJECTS: Project[] = [
  {
    id: 1,
    code: 'PRJ-2025-001',
    name: 'ระบบมอนิเตอร์ IoT โรงงาน',
    customerId: 1,
    contractValue: 850000,
    dueDate: '2026-10-15',
    status: 'IN_PROGRESS',
    description: 'ติดตั้งเซ็นเซอร์และแดชบอร์ดติดตามเครื่องจักร',
    createdAt: '2025-11-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 2,
    code: 'PRJ-2025-002',
    name: 'แอปสั่งงานซ่อมบำรุง',
    customerId: 2,
    contractValue: 420000,
    dueDate: '2026-08-30',
    status: 'IN_PROGRESS',
    description: 'Mobile + Admin สำหรับแจ้งซ่อมในโรงงาน',
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
  },
  {
    id: 3,
    code: 'PRJ-2026-003',
    name: 'ระบบฟาร์มอัจฉริยะเฟส 1',
    customerId: 3,
    contractValue: 150000,
    dueDate: '2026-12-01',
    status: 'PLANNING',
    description: 'เซ็นเซอร์ความชื้นดิน + แจ้งเตือน',
    createdAt: '2026-08-22T09:00:00.000Z',
    updatedAt: '2026-08-22T09:00:00.000Z',
  },
];

const SEED_TASKS: TaskItem[] = [
  {
    id: 1,
    projectId: 1,
    title: 'สำรวจไซต์และวางผังเซ็นเซอร์',
    description: '',
    status: 'DONE',
    priority: 'HIGH',
    assigneeId: 2,
    dueDate: '2026-03-01',
    sortOrder: 1,
    dependsOnTaskId: null,
  },
  {
    id: 2,
    projectId: 1,
    title: 'ติดตั้ง Gateway',
    description: '',
    status: 'DONE',
    priority: 'HIGH',
    assigneeId: 3,
    dueDate: '2026-05-15',
    sortOrder: 2,
    dependsOnTaskId: 1,
  },
  {
    id: 3,
    projectId: 1,
    title: 'พัฒนาแดชบอร์ด Realtime',
    description: '',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    assigneeId: 2,
    dueDate: '2026-09-20',
    sortOrder: 3,
    dependsOnTaskId: 2,
  },
  {
    id: 4,
    projectId: 1,
    title: 'ทดสอบรับมอบกับลูกค้า',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: 3,
    dueDate: '2026-10-10',
    sortOrder: 4,
    dependsOnTaskId: 3,
  },
  {
    id: 5,
    projectId: 2,
    title: 'ออกแบบ UI แจ้งซ่อม',
    description: '',
    status: 'DONE',
    priority: 'MEDIUM',
    assigneeId: 4,
    dueDate: '2026-04-01',
    sortOrder: 1,
    dependsOnTaskId: null,
  },
  {
    id: 6,
    projectId: 2,
    title: 'API งานซ่อม',
    description: '',
    status: 'REVIEW',
    priority: 'HIGH',
    assigneeId: 2,
    dueDate: '2026-08-15',
    sortOrder: 2,
    dependsOnTaskId: 5,
  },
  {
    id: 7,
    projectId: 2,
    title: 'UAT กับทีมซ่อมบำรุง',
    description: '',
    status: 'TODO',
    priority: 'HIGH',
    assigneeId: 3,
    dueDate: '2026-08-25',
    sortOrder: 3,
    dependsOnTaskId: 6,
  },
];

const SEED_DELIVERIES: Delivery[] = [
  {
    id: 1,
    projectId: 1,
    version: 'v0.9',
    deliveredAt: '2026-07-01T10:00:00.000Z',
    deliveredByUserId: 2,
    receivedByContactId: 1,
    acceptance: 'ACCEPTED',
    note: 'ส่งมอบแดชบอร์ดรอบทดสอบ',
    attachmentName: 'delivery-v09.pdf',
  },
  {
    id: 2,
    projectId: 1,
    version: 'v1.0-rc',
    deliveredAt: '2026-08-28T14:00:00.000Z',
    deliveredByUserId: 2,
    receivedByContactId: 1,
    acceptance: 'PENDING',
    note: 'รอลูกค้าตรวจรับเฟสหลัก',
    attachmentName: null,
  },
];

export interface ProjectInput {
  name: string;
  customerId: number;
  contractValue: number;
  dueDate: string;
  status: ProjectStatus;
  description: string;
}

export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: string | null;
  dependsOnTaskId: number | null;
}

export interface DeliveryInput {
  version: string;
  deliveredAt: string;
  deliveredByUserId: number;
  receivedByContactId: number | null;
  acceptance: DeliveryAcceptance;
  note: string;
  attachmentName: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly projectsSignal = signal<Project[]>(this.load(PROJECTS_KEY, SEED_PROJECTS));
  private readonly tasksSignal = signal<TaskItem[]>(this.load(TASKS_KEY, SEED_TASKS));
  private readonly deliveriesSignal = signal<Delivery[]>(this.load(DELIVERIES_KEY, SEED_DELIVERIES));

  private nextProjectId = this.maxId(this.projectsSignal()) + 1;
  private nextTaskId = this.maxId(this.tasksSignal()) + 1;
  private nextDeliveryId = this.maxId(this.deliveriesSignal()) + 1;

  readonly projects = this.projectsSignal.asReadonly();
  readonly projectCount = computed(() => this.projectsSignal().length);

  listProjects(): Observable<Project[]> {
    return of(structuredClone(this.projectsSignal())).pipe(delay(200));
  }

  getProject(id: number): Project | undefined {
    return this.projectsSignal().find((p) => p.id === id);
  }

  getProjectsByCustomer(customerId: number): Project[] {
    return this.projectsSignal().filter((p) => p.customerId === customerId);
  }

  createProject(input: ProjectInput): Observable<Project> {
    if (!input.name.trim() || !input.customerId) {
      return throwError(() => new Error('กรุณาระบุชื่อโครงการและลูกค้า'));
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: this.nextProjectId++,
      code: `PRJ-${new Date().getFullYear()}-${String(this.nextProjectId).padStart(3, '0')}`,
      name: input.name.trim(),
      customerId: input.customerId,
      contractValue: Number(input.contractValue) || 0,
      dueDate: input.dueDate,
      status: input.status,
      description: input.description.trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.projectsSignal.update((list) => {
      const next = [project, ...list];
      this.save(PROJECTS_KEY, next);
      return next;
    });
    return of(structuredClone(project)).pipe(delay(250));
  }

  updateProject(id: number, input: ProjectInput): Observable<Project> {
    const current = this.getProject(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบโครงการ'));
    }
    const updated: Project = {
      ...current,
      name: input.name.trim(),
      customerId: input.customerId,
      contractValue: Number(input.contractValue) || 0,
      dueDate: input.dueDate,
      status: input.status,
      description: input.description.trim(),
      updatedAt: new Date().toISOString(),
    };
    this.projectsSignal.update((list) => {
      const next = list.map((p) => (p.id === id ? updated : p));
      this.save(PROJECTS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(250));
  }

  getTasks(projectId: number): TaskItem[] {
    return this.tasksSignal()
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  progressPercent(projectId: number): number {
    const tasks = this.getTasks(projectId);
    if (!tasks.length) {
      return 0;
    }
    const done = tasks.filter((t) => t.status === 'DONE').length;
    return Math.round((done / tasks.length) * 100);
  }

  createTask(projectId: number, input: TaskInput): Observable<TaskItem> {
    if (!input.title.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่องาน'));
    }
    const tasks = this.getTasks(projectId);
    const task: TaskItem = {
      id: this.nextTaskId++,
      projectId,
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      sortOrder: tasks.length + 1,
      dependsOnTaskId: input.dependsOnTaskId,
    };
    this.tasksSignal.update((list) => {
      const next = [...list, task];
      this.save(TASKS_KEY, next);
      return next;
    });
    this.touchProject(projectId);
    return of(structuredClone(task)).pipe(delay(200));
  }

  updateTaskStatus(taskId: number, status: TaskStatus): Observable<TaskItem> {
    const current = this.tasksSignal().find((t) => t.id === taskId);
    if (!current) {
      return throwError(() => new Error('ไม่พบงานย่อย'));
    }
    const updated = { ...current, status };
    this.tasksSignal.update((list) => {
      const next = list.map((t) => (t.id === taskId ? updated : t));
      this.save(TASKS_KEY, next);
      return next;
    });
    this.touchProject(current.projectId);
    return of(structuredClone(updated)).pipe(delay(150));
  }

  updateTask(taskId: number, input: TaskInput): Observable<TaskItem> {
    const current = this.tasksSignal().find((t) => t.id === taskId);
    if (!current) {
      return throwError(() => new Error('ไม่พบงานย่อย'));
    }
    const updated: TaskItem = {
      ...current,
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      dependsOnTaskId: input.dependsOnTaskId,
    };
    this.tasksSignal.update((list) => {
      const next = list.map((t) => (t.id === taskId ? updated : t));
      this.save(TASKS_KEY, next);
      return next;
    });
    this.touchProject(current.projectId);
    return of(structuredClone(updated)).pipe(delay(200));
  }

  getDeliveries(projectId: number): Delivery[] {
    return this.deliveriesSignal()
      .filter((d) => d.projectId === projectId)
      .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
  }

  createDelivery(projectId: number, input: DeliveryInput): Observable<Delivery> {
    if (!input.version.trim()) {
      return throwError(() => new Error('กรุณาระบุเวอร์ชัน'));
    }
    const delivery: Delivery = {
      id: this.nextDeliveryId++,
      projectId,
      version: input.version.trim(),
      deliveredAt: input.deliveredAt || new Date().toISOString(),
      deliveredByUserId: input.deliveredByUserId,
      receivedByContactId: input.receivedByContactId,
      acceptance: input.acceptance,
      note: input.note.trim(),
      attachmentName: input.attachmentName,
    };
    this.deliveriesSignal.update((list) => {
      const next = [delivery, ...list];
      this.save(DELIVERIES_KEY, next);
      return next;
    });
    this.touchProject(projectId);
    return of(structuredClone(delivery)).pipe(delay(250));
  }

  updateDeliveryAcceptance(id: number, acceptance: DeliveryAcceptance): Observable<Delivery> {
    const current = this.deliveriesSignal().find((d) => d.id === id);
    if (!current) {
      return throwError(() => new Error('ไม่พบการส่งมอบ'));
    }
    const updated = { ...current, acceptance };
    this.deliveriesSignal.update((list) => {
      const next = list.map((d) => (d.id === id ? updated : d));
      this.save(DELIVERIES_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(150));
  }

  overdueTasks(): TaskItem[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.tasksSignal().filter(
      (t) => t.dueDate && t.dueDate < today && t.status !== 'DONE'
    );
  }

  private touchProject(id: number): void {
    this.projectsSignal.update((list) => {
      const next = list.map((p) =>
        p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p
      );
      this.save(PROJECTS_KEY, next);
      return next;
    });
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
