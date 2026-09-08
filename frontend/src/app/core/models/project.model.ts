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
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  sortOrder: number;
  isOverdue: boolean;
}

/** ยังไม่มี API — เก็บใน memory เท่านั้น */
export interface Delivery {
  id: number;
  projectId: number;
  version: string;
  deliveredAt: string;
  deliveredByUserId: number;
  receivedByContactId: number | null;
  acceptance: DeliveryAcceptance;
  note: string;
  attachmentName: string | null;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'ร่าง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DELIVERED: 'ส่งมอบแล้ว',
  CLOSED: 'ปิดโครงการ',
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
  WAITING: 'รอข้อมูล',
  REVIEW: 'รอตรวจ',
  DONE: 'เสร็จ',
};

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'DOING', 'WAITING', 'REVIEW', 'DONE'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = PRIORITY_LABELS;

export const TASK_PRIORITIES: TaskPriority[] = PROJECT_PRIORITIES;

export const DELIVERY_ACCEPTANCE_LABELS: Record<DeliveryAcceptance, string> = {
  PENDING: 'รอตรวจรับ',
  ACCEPTED: 'ยอมรับ',
  REJECTED: 'ตีกลับ',
};
