import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  Delivery,
  DeliveryAcceptance,
  Project,
  ProjectPriority,
  ProjectStatus,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../models/project.model';

/** CreateProjectDto / UpdateProjectDto */
export interface ProjectInput {
  customerId?: number;
  name?: string;
  code?: string;
  description?: string;
  projectType?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  startDate?: string;
  targetEndDate?: string;
  actualEndDate?: string;
  /** API รับเป็น decimal string */
  contractValue?: string;
  functionCount?: number;
  managerUserId?: number;
}

export interface ProjectListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: ProjectStatus;
  customerId?: number;
  priority?: ProjectPriority;
  managerUserId?: number;
}

/** CreateTaskDto / UpdateTaskDto */
export interface TaskInput {
  title?: string;
  parentTaskId?: number | null;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedUserId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: string;
  actualHours?: string;
  sortOrder?: number;
}

export interface TaskListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedUserId?: number;
  parentTaskId?: number;
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

/** รูปดิบจาก API — contractValue/estimatedHours เป็น decimal string, subTasks ซ้อนกัน */
type ApiProject = Omit<Project, 'contractValue'> & { contractValue: string | number | null };
type ApiTask = Omit<TaskItem, 'estimatedHours' | 'actualHours'> & {
  estimatedHours: string | number | null;
  actualHours: string | number | null;
  subTasks?: ApiTask[];
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/projects`;
  private readonly tasksBase = `${environment.apiBaseUrl}/tasks`;

  private readonly projectsSignal = signal<Project[]>([]);
  private readonly tasksSignal = signal<TaskItem[]>([]);
  private readonly deliveriesSignal = signal<Delivery[]>([]);
  private nextDeliveryId = 1;

  readonly projects = this.projectsSignal.asReadonly();
  readonly projectCount = computed(() => this.projectsSignal().length);

  listProjects(params?: ProjectListParams): Observable<Project[]> {
    return this.http
      .get<ApiProject[] | { items: ApiProject[] }>(this.base, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => asList(body).map((row) => this.normalizeProject(row))),
        tap((list) => this.projectsSignal.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getProject(id: number): Project | undefined {
    return this.projectsSignal().find((p) => p.id === id);
  }

  fetchProject(id: number): Observable<Project> {
    return this.http.get<ApiProject>(`${this.base}/${id}`).pipe(
      map((row) => this.normalizeProject(row)),
      tap((project) => this.projectsSignal.update((list) => upsertById(list, project))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  getProjectsByCustomer(customerId: number): Project[] {
    return this.projectsSignal().filter((p) => p.customerId === customerId);
  }

  createProject(input: ProjectInput): Observable<Project> {
    return this.http.post<ApiProject>(this.base, pruneUndefined(input)).pipe(
      map((row) => this.normalizeProject(row)),
      tap((project) => this.projectsSignal.update((list) => upsertById(list, project))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  updateProject(id: number, input: ProjectInput): Observable<Project> {
    return this.http.put<ApiProject>(`${this.base}/${id}`, pruneUndefined(input)).pipe(
      map((row) => this.normalizeProject(row)),
      tap((project) => this.projectsSignal.update((list) => upsertById(list, project))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /* ——— งานย่อย ——— */

  getTasks(projectId: number): TaskItem[] {
    return this.tasksSignal()
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  listTasks(projectId: number, params?: TaskListParams): Observable<TaskItem[]> {
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(`${this.base}/${projectId}/tasks`, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => this.flattenTasks(asList(body), projectId)),
        tap((rows) => {
          this.tasksSignal.update((all) => [
            ...all.filter((t) => t.projectId !== projectId),
            ...rows,
          ]);
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** % จาก progress ของ project ถ้ามี ไม่งั้นคำนวณจาก task ที่โหลดไว้ */
  progressPercent(projectId: number): number {
    const percent = this.getProject(projectId)?.progress?.percent;
    if (typeof percent === 'number') {
      return percent;
    }
    return this.computeProgress(this.getTasks(projectId));
  }

  createTask(projectId: number, input: TaskInput): Observable<TaskItem> {
    return this.http
      .post<ApiTask>(`${this.base}/${projectId}/tasks`, pruneUndefined(input))
      .pipe(
        map((row) => this.normalizeTask(row, projectId)),
        tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  updateTask(projectId: number, taskId: number, input: TaskInput): Observable<TaskItem> {
    return this.http
      .put<ApiTask>(`${this.base}/${projectId}/tasks/${taskId}`, pruneUndefined(input))
      .pipe(
        map((row) => this.normalizeTask(row, projectId)),
        tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  removeTask(projectId: number, taskId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${projectId}/tasks/${taskId}`).pipe(
      tap(() => this.tasksSignal.update((list) => list.filter((t) => t.id !== taskId))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PATCH /tasks/{id}/status */
  updateTaskStatus(taskId: number, status: TaskStatus): Observable<TaskItem> {
    return this.http.patch<ApiTask>(`${this.tasksBase}/${taskId}/status`, { status }).pipe(
      map((row) => this.normalizeTask(row, this.projectIdOf(taskId, row))),
      tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PATCH /tasks/{id}/order */
  updateTaskOrder(taskId: number, sortOrder: number): Observable<TaskItem> {
    return this.http.patch<ApiTask>(`${this.tasksBase}/${taskId}/order`, { sortOrder }).pipe(
      map((row) => this.normalizeTask(row, this.projectIdOf(taskId, row))),
      tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  overdueTasks(): TaskItem[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.tasksSignal().filter(
      (t) => t.isOverdue || (t.dueDate != null && t.dueDate < today && t.status !== 'DONE')
    );
  }

  listOverdueTasks(params?: {
    projectId?: number;
    assignedUserId?: number;
  }): Observable<TaskItem[]> {
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(`${this.tasksBase}/overdue`, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => asList(body).map((t) => this.normalizeTask(t, t.projectId))),
        tap((rows) => {
          this.tasksSignal.update((all) => {
            const byId = new Map(all.map((t) => [t.id, t]));
            for (const row of rows) {
              byId.set(row.id, row);
            }
            return Array.from(byId.values());
          });
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /* ——— Deliveries: in-memory จนกว่า API พร้อม ——— */

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
    this.deliveriesSignal.update((list) => [delivery, ...list]);
    return of(structuredClone(delivery));
  }

  updateDeliveryAcceptance(id: number, acceptance: DeliveryAcceptance): Observable<Delivery> {
    const current = this.deliveriesSignal().find((d) => d.id === id);
    if (!current) {
      return throwError(() => new Error('ไม่พบการส่งมอบ'));
    }
    const updated = { ...current, acceptance };
    this.deliveriesSignal.update((list) => list.map((d) => (d.id === id ? updated : d)));
    return of(structuredClone(updated));
  }

  private projectIdOf(taskId: number, row: ApiTask): number {
    return row.projectId ?? this.tasksSignal().find((t) => t.id === taskId)?.projectId ?? 0;
  }

  private normalizeProject(row: ApiProject): Project {
    return { ...row, contractValue: toNumber(row.contractValue) };
  }

  private flattenTasks(nodes: ApiTask[], projectId: number): TaskItem[] {
    const out: TaskItem[] = [];
    const walk = (list: ApiTask[], parentId: number | null) => {
      for (const node of list) {
        out.push(this.normalizeTask({ ...node, parentTaskId: node.parentTaskId ?? parentId }, projectId));
        if (node.subTasks?.length) {
          walk(node.subTasks, node.id);
        }
      }
    };
    walk(nodes, null);
    return out;
  }

  private normalizeTask(row: ApiTask, projectId: number): TaskItem {
    return {
      id: row.id,
      projectId: row.projectId ?? projectId,
      parentTaskId: row.parentTaskId ?? null,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority,
      assignedUserId: row.assignedUserId ?? null,
      assignedUser: row.assignedUser ?? null,
      startDate: row.startDate ?? null,
      dueDate: row.dueDate ?? null,
      completedAt: row.completedAt ?? null,
      estimatedHours: toNumber(row.estimatedHours),
      actualHours: toNumber(row.actualHours),
      sortOrder: row.sortOrder ?? 0,
      isOverdue: row.isOverdue ?? false,
    };
  }

  private computeProgress(tasks: TaskItem[]): number {
    if (!tasks.length) {
      return 0;
    }
    const done = tasks.filter((t) => t.status === 'DONE').length;
    return Math.round((done / tasks.length) * 100);
  }
}
