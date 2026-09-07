export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DeliveryAcceptance = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Project {
  id: number;
  code: string;
  name: string;
  customerId: number;
  contractValue: number;
  dueDate: string;
  status: ProjectStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: number;
  projectId: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: string | null;
  sortOrder: number;
  /** งานที่ต้องเสร็จก่อน (optional) */
  dependsOnTaskId: number | null;
}

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
  PLANNING: 'วางแผน',
  IN_PROGRESS: 'กำลังดำเนินการ',
  ON_HOLD: 'พักไว้',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังทำ',
  REVIEW: 'รอตรวจ',
  DONE: 'เสร็จ',
};

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'ต่ำ',
  MEDIUM: 'ปานกลาง',
  HIGH: 'สูง',
  URGENT: 'ด่วนมาก',
};

export const DELIVERY_ACCEPTANCE_LABELS: Record<DeliveryAcceptance, string> = {
  PENDING: 'รอตรวจรับ',
  ACCEPTED: 'ยอมรับ',
  REJECTED: 'ตีกลับ',
};
