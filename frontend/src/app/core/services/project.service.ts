import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { ApiEnvelopeService } from '../http/api-envelope.service';
import { optionalResourceOptions } from '../http/http-context';
import { Paginated, asList, asPage, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  Delivery,
  DeliveryAcceptance,
  Project,
  ProjectProgress,
  ProjectPriority,
  ProjectReport,
  ProjectStatus,
  TaskItem,
  TaskPriority,
  TaskProjectRef,
  TaskReviewItem,
  ProjectOption,
  TaskReviewListParams,
  TaskStatus,
  TaskSubmission,
  TaskSubmissionFile,
  TaskSummary,
} from '../models/project.model';
import { ProjectMaQuotaResponse } from '../models/ma.model';
import { UserSummary } from '../models/user.model';

/** newCustomer บน CreateProjectDto — สร้างลูกค้าพร้อมโปรเจกต์ (ไม่มี customerId) */
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

/** CreateProjectDto / UpdateProjectDto — `code` ออกโดย Backend ห้ามส่งจาก FE */
export interface ProjectInput {
  /** เลือกลูกค้าที่มีอยู่ — อย่าส่งพร้อม newCustomer */
  customerId?: number;
  /** ลูกค้าใหม่ — ส่งแทน customerId */
  newCustomer?: ProjectNewCustomerInput;
  name?: string;
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

/** รูปดิบจาก API — contractValue/percent อาจเป็น decimal string */
type ApiProjectProgress = Partial<
  Omit<ProjectProgress, 'percent' | 'totalTasks' | 'doneTasks' | 'overdueTasks'>
> & {
  percent?: string | number | null;
  totalTasks?: string | number | null;
  doneTasks?: string | number | null;
  overdueTasks?: string | number | null;
};

type ApiProject = Omit<Project, 'contractValue' | 'progress'> & {
  contractValue: string | number | null;
  progress?: ApiProjectProgress | null;
  progressPercent?: string | number | null;
};

/** GET /projects/:id/report — interceptor แกะ envelope แล้ว */
type ApiProjectReport = {
  projectId?: number | null;
  progress?: {
    percent?: string | number | null;
    totalTasks?: string | number | null;
  } | null;
  ticketCount?: string | number | null;
  deliveryCount?: string | number | null;
  maContractCount?: string | number | null;
};
type ApiTask = Omit<
  TaskItem,
  | 'estimatedHours'
  | 'actualHours'
  | 'project'
  | 'assignedBy'
  | 'assignedByUserId'
  | 'submissions'
> & {
  estimatedHours: string | number | null;
  actualHours: string | number | null;
  subTasks?: ApiTask[];
  project?: TaskProjectRef | null;
  /** ชื่อฟิลด์ผู้มอบหมายที่ BE อาจส่งมาต่างกัน */
  assignedByUserId?: number | null;
  assignedById?: number | null;
  assigned_by_user_id?: number | null;
  assignerUserId?: number | null;
  assignerId?: number | null;
  assignedBy?: UserSummary | null;
  assigner?: UserSummary | null;
  createdByUserId?: number | null;
  created_by_user_id?: number | null;
  createdById?: number | null;
  createdBy?: UserSummary | null;
  createdByUser?: UserSummary | null;
  created_by?: UserSummary | null;
  submissions?: ApiTaskSubmission[] | null;
};

type ApiTaskSubmissionFile = {
  id?: number;
  fileName?: string;
  name?: string;
  downloadUrl?: string;
  url?: string;
  mimeType?: string | null;
  fileSize?: number | null;
};

type ApiTaskSubmission = {
  id?: number;
  status?: string | null;
  report?: string | null;
  actualHours?: string | number | null;
  submittedAt?: string | null;
  downloadUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  name?: string | null;
  files?: ApiTaskSubmissionFile[] | null;
  attachments?: ApiTaskSubmissionFile[] | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: number | null;
  reviewFileName?: string | null;
  reviewDownloadUrl?: string | null;
};

type ApiTaskReviewItem = Omit<TaskReviewItem, 'submission'> & {
  submission: ApiTaskSubmission;
};

export interface TaskSubmissionInput {
  report: string;
  actualHours?: string | number | null;
  file?: File | null;
}

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
        tap((list) => {
          const customerId = params?.customerId;
          this.projectsSignal.update((prev) => {
            const prevById = new Map(prev.map((p) => [p.id, p]));
            const merged = list.map((p) => this.mergeProjectRow(p, prevById.get(p.id)));
            // แบบผู้ติดต่อ: เมื่อกรองตามลูกค้า แทนที่เฉพาะโปรเจกต์ของลูกค้านั้น · รวม CLOSED
            if (customerId != null && customerId > 0) {
              return [...prev.filter((p) => p.customerId !== customerId), ...merged];
            }
            return merged;
          });
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /projects แบบแบ่งหน้าฝั่ง server — ไม่แทนที่ cache กลาง (แค่ merge แถวที่ได้) */
  listProjectsPage(
    params: Omit<ProjectListParams, 'sortOrder'> & {
      page: number;
      limit: number;
      sortOrder?: 'ASC' | 'DESC';
    }
  ): Observable<{ items: Project[]; total: number }> {
    return this.http
      .get<ApiProject[] | Paginated<ApiProject>>(this.base, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          return { items: page.items.map((row) => this.normalizeProject(row)), total: page.total };
        }),
        tap(({ items }) =>
          this.projectsSignal.update((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            for (const p of items) {
              byId.set(p.id, this.mergeProjectRow(p, byId.get(p.id)));
            }
            return [...byId.values()];
          })
        ),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * GET /projects/options — รายการเบาสำหรับดรอปดาวน์ (ต้องมี project.view)
   * ไม่ส่ง search/limit = ทั้งหมด · ดรอปดาวน์ที่ข้อมูลโตได้ให้ส่ง limit เสมอ
   */
  listProjectOptions(params?: { search?: string; limit?: number }): Observable<ProjectOption[]> {
    return this.http
      .get<ProjectOption[]>(`${this.base}/options`, {
        params: toHttpParams({ search: params?.search?.trim(), limit: params?.limit }),
      })
      .pipe(
        map((body) => (Array.isArray(body) ? body : [])),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * GET /projects?customerId= — โปรเจกต์ของลูกค้า (รวม CLOSED · ห้ามตัดสถานะ)
   * ใช้กับดรอปดาวน์หลังเลือกลูกค้า — อย่าใส่รายการทั้งระบบ
   */
  listProjectsByCustomer(customerId: number, limit = 100): Observable<Project[]> {
    return this.listProjects({ customerId, limit });
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

  /** GET /projects/:id/report — ไม่ประกอบตัวเลขจากข้อมูลในหน้า */
  getProjectReport(id: number): Observable<ProjectReport> {
    return this.http.get<ApiProjectReport>(`${this.base}/${id}/report`).pipe(
      map((row) => this.normalizeProjectReport(row)),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * GET /projects/:id/ma-quota — โควตา MA ของโปรเจกต์นี้ (ประเภทเดียว)
   * สูตรเดียวกับ GET /ma-contracts/:id/quota — ห้ามนับเอง
   */
  getProjectMaQuota(
    projectId: number,
    onDate?: string
  ): Observable<ProjectMaQuotaResponse> {
    return this.http
      .get<ProjectMaQuotaResponse>(`${this.base}/${projectId}/ma-quota`, {
        params: toHttpParams({ onDate }),
      })
      .pipe(
        map((body) => this.normalizeProjectMaQuota(projectId, body)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  private normalizeProjectMaQuota(
    projectId: number,
    body: ProjectMaQuotaResponse | null | undefined
  ): ProjectMaQuotaResponse {
    const items = Array.isArray(body?.items) ? body.items : [];
    return {
      projectId: Number(body?.projectId) || projectId,
      items: items
        .filter((row) => row?.contract && row?.quota)
        .map((row) => ({
          contract: row.contract,
          quota: {
            contractId: Number(row.quota.contractId) || row.contract.id,
            periodYear: Number(row.quota.periodYear) || 0,
            periodMonth: Number(row.quota.periodMonth) || 0,
            periodStart: row.quota.periodStart ?? '',
            periodEnd: row.quota.periodEnd ?? '',
            quota: Number(row.quota.quota) || 0,
            used: Number(row.quota.used) || 0,
            remaining: Number(row.quota.remaining) || 0,
            isExhausted: row.quota.isExhausted === true,
          },
        })),
    };
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

  /** % ความคืบหน้า — จาก progress ของ project (รองรับคำนวณจาก done/total) */
  progressPercent(projectId: number): number | null {
    return this.progressPercentOf(this.getProject(projectId));
  }

  progressPercentOf(project: Project | null | undefined): number | null {
    const progress = project?.progress;
    if (!progress) {
      return null;
    }
    const totalTasks = progress.totalTasks ?? 0;
    const doneTasks = progress.doneTasks ?? 0;
    let percent = progress.percent;
    if (!Number.isFinite(percent) && totalTasks > 0) {
      percent = Math.round((doneTasks / totalTasks) * 100);
    }
    if (!Number.isFinite(percent)) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(percent)));
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

  /** PATCH /tasks/{id}/status — เริ่มงาน (DOING) ครั้งแรกจะดันโปรเจกต์จากร่าง → กำลังดำเนินการ */
  updateTaskStatus(taskId: number, status: TaskStatus): Observable<TaskItem> {
    return this.http.patch<ApiTask>(`${this.tasksBase}/${taskId}/status`, { status }).pipe(
      map((row) => this.normalizeTask(row, this.projectIdOf(taskId, row))),
      tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
      switchMap((task) => this.promoteDraftProjectIfStarting(task, status)),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** กดเริ่มงานแล้ว โปรเจกต์ยังเป็นร่าง → เปลี่ยนเป็นกำลังดำเนินการอัตโนมัติ */
  private promoteDraftProjectIfStarting(
    task: TaskItem,
    status: TaskStatus
  ): Observable<TaskItem> {
    if (status !== 'DOING') {
      return of(task);
    }
    const cached = this.getProject(task.projectId);
    const draft =
      cached?.status === 'DRAFT' ||
      (!cached && task.project?.status === 'DRAFT');
    if (!draft) {
      return of(task);
    }
    return this.updateProject(task.projectId, { status: 'IN_PROGRESS' }).pipe(
      map(() => task),
      catchError((err) => throwError(() => err))
    );
  }

  /**
   * POST /tasks/{id}/submissions — multipart: report, actualHours?, file?
   * ต้องใช้ task id เดียวกับงานที่เปิดอยู่
   * ห้ามตั้ง Content-Type เอง — ให้ browser ใส่ boundary
   */
  createTaskSubmission(taskId: number, input: TaskSubmissionInput): Observable<TaskItem> {
    const form = new FormData();
    form.append('report', input.report.trim());
    if (input.actualHours != null && String(input.actualHours).trim() !== '') {
      form.append('actualHours', String(input.actualHours).trim());
    }
    if (input.file) {
      form.append('file', input.file, input.file.name);
    }
    return this.http
      .post<ApiTask | { submissions?: ApiTaskSubmission[] } | ApiTaskSubmission>(
        `${this.tasksBase}/${taskId}/submissions`,
        form
      )
      .pipe(
        map((body) => this.normalizeSubmissionResponse(taskId, body)),
        tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * ผู้รับผิดชอบส่งตรวจ — ลำดับบังคับ:
   * 1) POST /tasks/:id/submissions (multipart)
   * 2) เมื่อสำเร็จเท่านั้น → PATCH /tasks/:id/submit-review
   * ห้ามเรียก submit-review เดี่ยว ๆ / ห้ามเรียก PATCH /review
   */
  submitTaskWithReport(taskId: number, input: TaskSubmissionInput): Observable<TaskItem> {
    const report = input.report?.trim() ?? '';
    if (!report) {
      return throwError(() => new Error('กรุณากรอกรายงานผลการทำงาน'));
    }
    return this.createTaskSubmission(taskId, { ...input, report }).pipe(
      switchMap(() => this.submitTaskReview(taskId))
    );
  }

  /** PATCH /tasks/{id}/submit-review — เรียกหลัง POST submissions สำเร็จเท่านั้น */
  private submitTaskReview(taskId: number): Observable<TaskItem> {
    return this.http.patch<ApiTask>(`${this.tasksBase}/${taskId}/submit-review`, null).pipe(
      map((row) => this.normalizeTask(row, this.projectIdOf(taskId, row))),
      tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * PATCH /tasks/{id}/review
   * - DONE: อนุมัติ
   * - DOING + reviewNote: ส่งกลับแก้ไข
   * - มีไฟล์ผู้ตรวจ → multipart { status, reviewNote?, file } · ไม่มีไฟล์ → JSON
   */
  reviewTask(
    taskId: number,
    status: 'DONE' | 'DOING',
    reviewNote?: string | null,
    file?: File | null
  ): Observable<TaskItem> {
    const note = (reviewNote ?? '').trim();
    let body: FormData | { status: 'DONE' | 'DOING'; reviewNote?: string };
    if (file) {
      const form = new FormData();
      form.append('status', status);
      if (note) {
        form.append('reviewNote', note);
      }
      form.append('file', file, file.name);
      body = form;
    } else {
      body = status === 'DOING' || note ? { status, reviewNote: note } : { status };
    }
    return this.http.patch<ApiTask>(`${this.tasksBase}/${taskId}/review`, body).pipe(
      map((row) => this.normalizeTask(row, this.projectIdOf(taskId, row))),
      tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * GET /tasks/reviews — งานตรวจ
   * PENDING = รอตรวจ · REVIEWED = รายการที่ผู้ใช้คนนี้ตรวจเอง (แม้เป็น ADMIN)
   */
  listTaskReviews(params: TaskReviewListParams): Observable<{ items: TaskReviewItem[]; total: number }> {
    return this.http
      .get<ApiTaskReviewItem[] | Paginated<ApiTaskReviewItem>>(`${this.tasksBase}/reviews`, {
        params: toHttpParams({
          tab: params.tab,
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          projectId: params.projectId ?? undefined,
          search: params.search?.trim() || undefined,
          result: params.tab === 'REVIEWED' ? params.result ?? undefined : undefined,
          sortBy: params.sortBy ?? undefined,
          sortOrder: params.sortBy ? params.sortOrder : undefined,
        }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          return {
            total: page.total,
            items: page.items.map((row) => ({
              ...row,
              submission: this.normalizeSubmissions([row.submission])![0],
            })),
          };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /tasks/{id} — รายละเอียดงาน (รวม submissions) */
  getTask(taskId: number): Observable<TaskItem> {
    return this.http.get<ApiTask>(`${this.tasksBase}/${taskId}`).pipe(
      map((row) => this.normalizeTask(row, row.projectId ?? 0)),
      tap((task) => this.tasksSignal.update((list) => upsertById(list, task))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * GET /tasks/me — งานของฉัน (server ใช้ user จาก JWT)
   * ห้ามส่ง userId จาก client
   */
  listMyTasks(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: TaskStatus;
  } = {}): Observable<TaskItem[]> {
    return this.http
      .get<ApiTask[] | { items: ApiTask[] }>(`${this.tasksBase}/me`, {
        params: toHttpParams({ limit: 100, ...params }),
      })
      .pipe(
        map((body) => asList(body).map((t) => this.normalizeTask(t, t.projectId))),
        tap((rows) => this.mergeTasks(rows)),
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
        const prev = byId.get(row.id);
        byId.set(row.id, this.mergeTaskRow(row, prev));
      }
      return Array.from(byId.values());
    });
  }

  /** รายการงานบางครั้งไม่ส่งผู้มอบหมาย — เก็บค่าที่เคยมีจาก GET รายตัว / ตอนสร้าง */
  private mergeTaskRow(incoming: TaskItem, existing?: TaskItem): TaskItem {
    if (!existing) {
      return incoming;
    }
    const assignedByUserId = incoming.assignedByUserId ?? existing.assignedByUserId;
    const assignedBy = incoming.assignedBy ?? existing.assignedBy;
    if (
      assignedByUserId === incoming.assignedByUserId &&
      assignedBy === incoming.assignedBy
    ) {
      return incoming;
    }
    return {
      ...incoming,
      assignedByUserId,
      assignedBy: assignedBy ?? (assignedByUserId ? existing.assignedBy : null),
    };
  }

  /**
   * ตอนสร้าง/แก้ไขงาน ถ้า API ไม่คืนผู้มอบหมาย ให้ใส่คนที่กดบันทึกไว้ในแคช FE
   * (รายการงานมักไม่ส่ง assignedBy)
   */
  stampAssignerIfMissing(taskId: number, user: UserSummary | null | undefined): void {
    if (!user?.id) {
      return;
    }
    this.tasksSignal.update((list) =>
      list.map((t) => {
        if (t.id !== taskId || t.assignedByUserId) {
          return t;
        }
        return {
          ...t,
          assignedByUserId: user.id,
          assignedBy: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
          },
        };
      })
    );
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
    const { progressPercent, progress: rawProgress, ...rest } = row;
    return {
      ...rest,
      contractValue: toNumber(row.contractValue),
      progress: this.normalizeProgress(rawProgress, progressPercent),
    };
  }

  private normalizeProjectReport(row: ApiProjectReport | null | undefined): ProjectReport {
    const percent = toNumber(row?.progress?.percent ?? undefined) ?? 0;
    const totalTasks = toNumber(row?.progress?.totalTasks ?? undefined) ?? 0;
    return {
      projectId: row?.projectId ?? null,
      progress: { percent, totalTasks },
      ticketCount: toNumber(row?.ticketCount ?? undefined),
      deliveryCount: toNumber(row?.deliveryCount ?? undefined),
      maContractCount: toNumber(row?.maContractCount ?? undefined),
    };
  }

  /** รายการโปรเจกต์บางครั้งไม่ส่ง progress — เก็บค่าที่เคยโหลดจาก GET รายตัวไว้ */
  private mergeProjectRow(incoming: Project, existing?: Project): Project {
    if (!existing?.progress || incoming.progress) {
      return incoming;
    }
    return { ...incoming, progress: existing.progress };
  }

  private normalizeProgress(
    raw: ApiProjectProgress | null | undefined,
    progressPercent?: string | number | null
  ): ProjectProgress | null {
    if (!raw && progressPercent == null) {
      return null;
    }
    const totalTasks = toNumber(raw?.totalTasks ?? undefined) ?? 0;
    const doneTasks = toNumber(raw?.doneTasks ?? undefined) ?? 0;
    let percent = toNumber(raw?.percent ?? progressPercent ?? undefined);
    if (percent == null && totalTasks > 0) {
      percent = Math.round((doneTasks / totalTasks) * 100);
    }
    if (percent == null && totalTasks === 0 && doneTasks === 0) {
      return null;
    }
    return {
      totalTasks,
      doneTasks,
      percent: percent ?? 0,
      overdueTasks: toNumber(raw?.overdueTasks ?? undefined) ?? 0,
      byStatus: raw?.byStatus ?? {},
    };
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
    const assignedBy =
      row.assignedBy ??
      row.assigner ??
      row.createdBy ??
      row.createdByUser ??
      row.created_by ??
      null;
    const assignedByUserId =
      row.assignedByUserId ??
      row.assignedById ??
      row.assigned_by_user_id ??
      row.assignerUserId ??
      row.assignerId ??
      row.createdByUserId ??
      row.createdById ??
      row.created_by_user_id ??
      assignedBy?.id ??
      null;
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
      assignedByUserId,
      assignedBy,
      startDate: row.startDate ?? null,
      dueDate: row.dueDate ?? null,
      completedAt: row.completedAt ?? null,
      estimatedHours: toNumber(row.estimatedHours),
      actualHours: toNumber(row.actualHours),
      sortOrder: row.sortOrder ?? 0,
      isOverdue: row.isOverdue ?? false,
      project: row.project ?? null,
      submissions: this.normalizeSubmissions(row.submissions),
    };
  }

  private normalizeSubmissionResponse(
    taskId: number,
    body: ApiTask | { submissions?: ApiTaskSubmission[] } | ApiTaskSubmission
  ): TaskItem {
    const asTask = body as ApiTask;
    if (asTask && typeof asTask === 'object' && 'title' in asTask && asTask.id != null) {
      return this.normalizeTask(asTask, asTask.projectId ?? this.projectIdOf(taskId, asTask));
    }
    const withSubs = body as { submissions?: ApiTaskSubmission[] };
    if (withSubs?.submissions) {
      const existing = this.tasksSignal().find((t) => t.id === taskId);
      return {
        id: taskId,
        projectId: existing?.projectId ?? 0,
        parentTaskId: existing?.parentTaskId ?? null,
        title: existing?.title ?? '',
        description: existing?.description ?? null,
        status: existing?.status ?? 'DOING',
        priority: existing?.priority ?? 'NORMAL',
        assignedUserId: existing?.assignedUserId ?? null,
        assignedUser: existing?.assignedUser ?? null,
        assignedByUserId: existing?.assignedByUserId ?? null,
        assignedBy: existing?.assignedBy ?? null,
        startDate: existing?.startDate ?? null,
        dueDate: existing?.dueDate ?? null,
        completedAt: existing?.completedAt ?? null,
        estimatedHours: existing?.estimatedHours ?? null,
        actualHours: existing?.actualHours ?? null,
        sortOrder: existing?.sortOrder ?? 0,
        isOverdue: existing?.isOverdue ?? false,
        project: existing?.project ?? null,
        submissions: this.normalizeSubmissions(withSubs.submissions) ?? [],
      };
    }
    // ตอบกลับเป็น submission เดี่ยว
    const single = body as ApiTaskSubmission;
    const existing = this.tasksSignal().find((t) => t.id === taskId);
    const subs = this.normalizeSubmissions([single]) ?? [];
    return {
      id: taskId,
      projectId: existing?.projectId ?? 0,
      parentTaskId: existing?.parentTaskId ?? null,
      title: existing?.title ?? '',
      description: existing?.description ?? null,
      status: existing?.status ?? 'DOING',
      priority: existing?.priority ?? 'NORMAL',
      assignedUserId: existing?.assignedUserId ?? null,
      assignedUser: existing?.assignedUser ?? null,
      assignedByUserId: existing?.assignedByUserId ?? null,
      assignedBy: existing?.assignedBy ?? null,
      startDate: existing?.startDate ?? null,
      dueDate: existing?.dueDate ?? null,
      completedAt: existing?.completedAt ?? null,
      estimatedHours: existing?.estimatedHours ?? null,
      actualHours: existing?.actualHours ?? null,
      sortOrder: existing?.sortOrder ?? 0,
      isOverdue: existing?.isOverdue ?? false,
      project: existing?.project ?? null,
      submissions: [...(existing?.submissions ?? []).filter((s) => s.id !== single.id), ...subs],
    };
  }

  private normalizeSubmissions(
    rows: ApiTaskSubmission[] | null | undefined
  ): TaskSubmission[] | undefined {
    if (!rows?.length) {
      return rows == null ? undefined : [];
    }
    return rows.map((s) => {
      // ห้ามใช้ fileUrl เป็น downloadUrl
      const downloadUrl = (s.downloadUrl || '').trim() || null;
      const fileName =
        (s.fileName || s.name || '').trim() ||
        (downloadUrl ? 'download' : null);
      const files = this.normalizeSubmissionFiles(s.files ?? s.attachments);
      if (downloadUrl && !files.some((f) => f.downloadUrl === downloadUrl)) {
        files.unshift({
          fileName: fileName || 'download',
          downloadUrl,
        });
      }
      return {
        id: s.id,
        status: s.status ?? null,
        report: s.report ?? null,
        actualHours: toNumber(s.actualHours),
        submittedAt: s.submittedAt ?? null,
        downloadUrl,
        fileName,
        files,
        reviewNote: (s.reviewNote ?? '').trim() || null,
        reviewedAt: s.reviewedAt ?? null,
        reviewedByUserId: s.reviewedByUserId ?? null,
        reviewFileName: (s.reviewFileName ?? '').trim() || null,
        reviewDownloadUrl: (s.reviewDownloadUrl ?? '').trim() || null,
      };
    });
  }

  private normalizeSubmissionFiles(
    rows: ApiTaskSubmissionFile[] | null | undefined
  ): TaskSubmissionFile[] {
    if (!rows?.length) {
      return [];
    }
    return rows
      .map((f) => ({
        id: f.id,
        fileName: (f.fileName || f.name || 'download').trim() || 'download',
        downloadUrl: (f.downloadUrl || f.url || '').trim(),
        mimeType: f.mimeType ?? null,
        fileSize: f.fileSize ?? null,
      }))
      .filter((f) => !!f.downloadUrl);
  }

  private computeProgress(tasks: TaskItem[]): number {
    if (!tasks.length) {
      return 0;
    }
    const done = tasks.filter((t) => t.status === 'DONE').length;
    return Math.round((done / tasks.length) * 100);
  }
}
