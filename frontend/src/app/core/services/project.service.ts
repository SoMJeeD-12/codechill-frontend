import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { ApiEnvelopeService } from '../http/api-envelope.service';
import { optionalResourceOptions } from '../http/http-context';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  Delivery,
  DeliveryAcceptance,
  Project,
  ProjectPriority,
  ProjectStatus,
  TaskItem,
  TaskPriority,
  TaskProjectRef,
  TaskStatus,
  TaskSummary,
} from '../models/project.model';

/** newCustomer บน CreateProjectDto — สร้างลูกค้าพร้อมโปรเจค (ไม่มี customerId) */
export interface ProjectNewCustomerInput {
  name: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  lineOfficialId?: string;
  facebookUrl?: string;
  note?: string;
}

/** CreateProjectDto / UpdateProjectDto */
export interface ProjectInput {
  /** เลือกลูกค้าที่มีอยู่ — อย่าส่งพร้อม newCustomer */
  customerId?: number;
  /** ลูกค้าใหม่ — ส่งแทน customerId */
  newCustomer?: ProjectNewCustomerInput;
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
  assignedUserId?: number | null;
  parentTaskId?: number;
  projectId?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export interface TaskDueListParams {
  withinDays?: number;
  projectId?: number;
  assignedUserId?: number;
  page?: number;
  limit?: number;
}

export interface DeliveryInput {
  title: string;
  deliveredAt: string;
  version?: string | null;
  description?: string | null;
  deliveredByUserId?: number | null;
  acceptedByContactId?: number | null;
  note?: string | null;
}

/** รูปดิบจาก API — contractValue/estimatedHours เป็น decimal string, subTasks ซ้อนกัน */
type ApiProject = Omit<Project, 'contractValue'> & { contractValue: string | number | null };
type ApiTask = Omit<TaskItem, 'estimatedHours' | 'actualHours' | 'project'> & {
  estimatedHours: string | number | null;
  actualHours: string | number | null;
  subTasks?: ApiTask[];
  project?: TaskProjectRef | null;
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
  private readonly envelope = inject(ApiEnvelopeService);
  private readonly base = `${environment.apiBaseUrl}/projects`;
  private readonly tasksBase = `${environment.apiBaseUrl}/tasks`;

  private readonly projectsSignal = signal<Project[]>([]);
  private readonly tasksSignal = signal<TaskItem[]>([]);
  private readonly deliveriesSignal = signal<Delivery[]>([]);

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

  createProject(input: ProjectInput): Observable<{ project: Project; message: string | null }> {
    this.envelope.takeMessage();
    return this.http.post<ApiProject>(this.base, pruneUndefined(input)).pipe(
      map((row) => {
        const project = this.normalizeProject(row);
        this.projectsSignal.update((list) => upsertById(list, project));
        return { project, message: this.envelope.takeMessage() };
      }),
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

  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => {
        this.projectsSignal.update((list) => list.filter((p) => p.id !== id));
        this.tasksSignal.update((list) => list.filter((t) => t.projectId !== id));
        this.deliveriesSignal.update((list) => list.filter((d) => d.projectId !== id));
      }),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /* ——— งานย่อย ——— */

  getTasks(projectId: number): TaskItem[] {
    return this.tasksSignal()
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  listTasks(
    projectId: number,
    params?: TaskListParams,
    opts?: { optional?: boolean }
  ): Observable<TaskItem[]> {
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(`${this.base}/${projectId}/tasks`, {
        params: toHttpParams({ ...params }),
        ...(opts?.optional ? optionalResourceOptions() : {}),
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

  /** % จาก progress ของ project ที่ API ส่งมาเท่านั้น — ไม่มีค่า = null (ห้ามโชว์เป็น 0) */
  progressPercent(projectId: number): number | null {
    const percent = this.getProject(projectId)?.progress?.percent;
    return typeof percent === 'number' ? percent : null;
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
    page?: number;
    limit?: number;
  }): Observable<TaskItem[]> {
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(`${this.tasksBase}/overdue`, {
        params: toHttpParams({ limit: 100, ...params }),
      })
      .pipe(
        map((body) => asList(body).map((t) => this.normalizeTask(t, t.projectId))),
        tap((rows) => this.mergeTasks(rows)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /tasks/due-soon — งานใกล้ครบกำหนด (รวมครบวันนี้ ไม่รวมเกินกำหนด) */
  listDueSoonTasks(params: TaskDueListParams = {}): Observable<TaskItem[]> {
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(`${this.tasksBase}/due-soon`, {
        params: toHttpParams({ withinDays: 7, limit: 100, ...params }),
      })
      .pipe(
        map((body) => asList(body).map((t) => this.normalizeTask(t, t.projectId))),
        tap((rows) => this.mergeTasks(rows)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /tasks/summary — ตัวเลขภาพรวมงานทั้งบริษัท / ต่อโครงการ */
  getTaskSummary(projectId?: number): Observable<TaskSummary> {
    return this.http
      .get<TaskSummary>(`${this.tasksBase}/summary`, {
        params: toHttpParams({ projectId }),
      })
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  /** GET /tasks — รายการงานแบบแบนทั้งบริษัท (มี project ย่อ) */
  listAllTasks(params: TaskListParams = {}): Observable<TaskItem[]> {
    const query = { ...params } as TaskListParams & { assignedUserId?: number | string | null };
    if (params.assignedUserId === null) {
      // backend อาจรับ null ต่างกัน — ส่งเป็น empty ไม่ได้ ให้ FE กรองหลังโหลดถ้าจำเป็น
      delete query.assignedUserId;
    }
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(this.tasksBase, {
        params: toHttpParams({ limit: 100, ...query }),
      })
      .pipe(
        map((body) => {
          let rows = asList(body).map((t) => this.normalizeTask(t, t.projectId));
          if (params.assignedUserId === null) {
            rows = rows.filter((t) => t.assignedUserId == null);
          }
          return rows;
        }),
        tap((rows) => this.mergeTasks(rows)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  private mergeTasks(rows: TaskItem[]): void {
    this.tasksSignal.update((all) => {
      const byId = new Map(all.map((t) => [t.id, t]));
      for (const row of rows) {
        byId.set(row.id, row);
      }
      return Array.from(byId.values());
    });
  }

  /* ——— Deliveries ——— */

  getDeliveries(projectId: number): Delivery[] {
    return this.deliveriesSignal()
      .filter((d) => d.projectId === projectId)
      .sort((a, b) => {
        const byDate = b.deliveredAt.localeCompare(a.deliveredAt);
        return byDate !== 0 ? byDate : b.id - a.id;
      });
  }

  listDeliveries(projectId: number, opts?: { optional?: boolean }): Observable<Delivery[]> {
    return this.http
      .get<Delivery[] | { items: Delivery[] }>(`${this.base}/${projectId}/deliveries`, {
        ...(opts?.optional ? optionalResourceOptions() : {}),
      })
      .pipe(
        map(asList),
        tap((rows) => {
          this.deliveriesSignal.update((all) => [
            ...all.filter((d) => d.projectId !== projectId),
            ...rows,
          ]);
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  createDelivery(projectId: number, input: DeliveryInput): Observable<Delivery> {
    if (!input.title.trim()) {
      return throwError(() => new Error('กรุณาระบุหัวข้อการส่งมอบ'));
    }
    return this.http
      .post<Delivery>(`${this.base}/${projectId}/deliveries`, pruneUndefined({
        title: input.title.trim(),
        deliveredAt: input.deliveredAt,
        version: input.version?.trim() || undefined,
        description: input.description?.trim() || undefined,
        deliveredByUserId: input.deliveredByUserId ?? undefined,
        acceptedByContactId: input.acceptedByContactId ?? undefined,
        note: input.note?.trim() || undefined,
      }))
      .pipe(
        tap((row) => this.deliveriesSignal.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  updateDeliveryAcceptance(
    id: number,
    acceptanceStatus: DeliveryAcceptance,
    opts?: {
      acceptedByContactId?: number | null;
      note?: string | null;
      /** ส่งเฉพาะตอน ACCEPTED — boolean จริง ห้ามเป็น string */
      isFinal?: boolean;
    }
  ): Observable<Delivery> {
    return this.http
      .patch<Delivery>(`${environment.apiBaseUrl}/deliveries/${id}/acceptance`, pruneUndefined({
        acceptanceStatus,
        acceptedByContactId: opts?.acceptedByContactId ?? undefined,
        note: opts?.note?.trim() || undefined,
        isFinal: opts?.isFinal,
      }))
      .pipe(
        tap((row) => this.deliveriesSignal.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
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
      project: row.project ?? null,
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
