import { UserSummary } from './user.model';

export type ProjectStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

export type ProjectPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type TaskStatus = 'TODO' | 'DOING' | 'WAITING' | 'REVIEW' | 'DONE';

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type DeliveryAcceptance = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface CustomerSummary {
  id: number;
  name: string;
}

/** ProjectProgressDto */
export interface ProjectProgress {
  totalTasks: number;
  doneTasks: number;
  percent: number;
  overdueTasks: number;
  byStatus: Partial<Record<TaskStatus, number>>;
}

/** ProjectResponseDto */
export interface Project {
  id: number;
  customerId: number;
  customer: CustomerSummary | null;
  code: string | null;
  name: string;
  description: string | null;
  projectType: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: string | null;
  targetEndDate: string | null;
  actualEndDate: string | null;
  contractValue: number | null;
  functionCount: number | null;
  managerUserId: number | null;
  manager: UserSummary | null;
  progress: ProjectProgress | null;
  createdAt: string;
  updatedAt: string;
}

/** ไฟล์รายงานที่ผู้รับผิดชอบแนบตอนส่งตรวจ */
export interface TaskSubmissionFile {
  id?: number;
  fileName: string;
  downloadUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

/** สถานะรายงานส่งตรวจ — ต้องมี PENDING ก่อน submit-review / review */
export type TaskSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

/** รายงานจากผู้รับผิดชอบ (submissions บน GET /tasks/:id) */
export interface TaskSubmission {
  id?: number;
  status: TaskSubmissionStatus | null;
  report: string | null;
  actualHours: number | null;
  submittedAt: string | null;
  /** ไฟล์รายงานหลัก — ดาวน์โหลดด้วย Authorization ห้ามใช้ fileUrl */
  downloadUrl: string | null;
  fileName: string | null;
  files: TaskSubmissionFile[];
}

/** TaskResponseDto (subTasks ถูก flatten เก็บใน store) */
export interface TaskItem {
  id: number;
  projectId: number;
  parentTaskId: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedUserId: number | null;
  assignedUser: UserSummary | null;
  /** ผู้มอบหมายงาน (ถ้า BE ส่งมา) */
  assignedByUserId: number | null;
  assignedBy: UserSummary | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  sortOrder: number;
  isOverdue: boolean;
  /** มีตอน GET /tasks ทั้งบริษัท */
  project?: TaskProjectRef | null;
  /** รายงานส่งตรวจ — มักมากับ GET /tasks/:id */
  submissions?: TaskSubmission[];
}

/** โครงการย่อที่พ่วงในรายการงานทั้งบริษัท */
export interface TaskProjectRef {
  id: number;
  code: string | null;
  name: string;
  status: ProjectStatus;
}

export type TaskStatusCounts = Record<TaskStatus, number>;

export interface TaskAssigneeSummary {
  assignedUserId: number | null;
  fullName: string | null;
  openTasks: number;
  overdueTasks: number;
  byStatus: Partial<Record<TaskStatus, number>>;
}

/** GET /tasks/summary */
export interface TaskSummary {
  totalTasks: number;
  openTasks: number;
  overdueTasks: number;
  byStatus: TaskStatusCounts;
  overdueByStatus: Partial<Record<Exclude<TaskStatus, 'DONE'>, number>>;
  byAssignee: TaskAssigneeSummary[];
}

/** DeliveryResponseDto */
export interface Delivery {
  id: number;
  projectId: number;
  deliveryNo: string | null;
  title: string;
  version: string | null;
  description: string | null;
  deliveredAt: string;
  acceptanceStatus: DeliveryAcceptance;
  acceptedAt: string | null;
  acceptedByContactId: number | null;
  deliveredByUserId: number | null;
  note: string | null;
  /** การส่งมอบครั้งสุดท้ายของโครงการ */
  isFinal: boolean;
  /** ออกประกันจากใบนี้ได้ไหม (= ACCEPTED && isFinal) — ใช้ค่าจาก backend ห้ามคำนวณเอง */
  canIssueWarranty: boolean;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'ร่าง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DELIVERED: 'ส่งมอบแล้ว',
  CLOSED: 'ปิดโปรเจค',
  CANCELLED: 'ยกเลิก',
};

export const PROJECT_STATUSES: ProjectStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
];

/** สถานะที่ถือว่าโครงการยังเปิดอยู่ */
export const OPEN_PROJECT_STATUSES: ProjectStatus[] = ['DRAFT', 'IN_PROGRESS'];

export const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  LOW: 'ต่ำ',
  NORMAL: 'ปานกลาง',
  HIGH: 'สูง',
  URGENT: 'ด่วนมาก',
};

export const PROJECT_PRIORITIES: ProjectPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'รอดำเนินการ',
  DOING: 'กำลังทำ',
  WAITING: 'พักงาน',
  REVIEW: 'รอตรวจ',
  DONE: 'ตรวจผ่านและเสร็จสมบูรณ์',
};

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'DOING', 'WAITING', 'REVIEW', 'DONE'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = PRIORITY_LABELS;

export const TASK_PRIORITIES: TaskPriority[] = PROJECT_PRIORITIES;

export const DELIVERY_ACCEPTANCE_LABELS: Record<DeliveryAcceptance, string> = {
  PENDING: 'รอตรวจรับ',
  ACCEPTED: 'ยอมรับ',
  REJECTED: 'ตีกลับ',
};
