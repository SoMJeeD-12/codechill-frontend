import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MyTasksCounts,
  MyTasksTab,
  PROJECT_STATUS_LABELS,
  ProjectStatus,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { createServerList } from '../../shared/utils/server-list';
import { TaskEditDialogComponent } from '../projects/task-edit-dialog.component';
import { TaskReviewDialogComponent } from '../projects/task-review-dialog.component';
import { TaskSubmitReportDialogComponent } from '../projects/task-submit-report-dialog.component';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { tap } from 'rxjs/operators';

export type TasksPageMode =
  | 'all'
  | 'me'
  | 'unassigned'
  | 'doing'
  | 'review'
  | 'overdue';

/** แท็บในหน้างานของฉัน — กรองที่ BE ด้วย GET /tasks/me?tab= */
export type MyTasksView = 'all' | 'todo' | 'doing' | 'review' | 'done' | 'overdue';

const MY_VIEW_FROM_QUERY: Record<string, MyTasksView> = {
  todo: 'todo',
  unassigned: 'todo',
  doing: 'doing',
  review: 'review',
  done: 'done',
  overdue: 'overdue',
  all: 'all',
};

const MY_VIEW_TAB: Record<MyTasksView, MyTasksTab> = {
  all: 'ALL',
  todo: 'TODO',
  doing: 'IN_PROGRESS',
  review: 'REVIEW',
  done: 'DONE',
  overdue: 'OVERDUE',
};

type TaskSortKey =
  | 'title' | 'projectCode' | 'project' | 'assignee' | 'assigner' | 'status' | 'priority' | 'dueDate' | 'startDate';

const SERVER_SORT_KEYS = new Set<TaskSortKey>(['title', 'status', 'priority', 'dueDate', 'startDate']);

const PAGE_META: Record<TasksPageMode, { title: string; subtitle: string }> = {
  all: { title: 'งานทั้งหมด', subtitle: '' },
  me: { title: 'งานโปรเจกต์', subtitle: 'งานในโปรเจกต์ที่ได้รับมอบหมาย' },
  unassigned: { title: 'งานที่ยังไม่มอบหมาย', subtitle: '' },
  doing: { title: 'งานกำลังดำเนินการ', subtitle: '' },
  review: {
    title: 'ตรวจงานโปรเจกต์',
    subtitle: 'งานที่ลูกน้องส่งมาให้ตรวจ',
  },
  overdue: { title: 'งานเกินกำหนด', subtitle: '' },
};

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MatSnackBarModule,
    ThaiDatePipe,
    RowActionsComponent,
    TablePaginatorComponent,
    ListLoadingBarComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.scss',
})
export class TasksPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** งานของฉัน = GET /tasks/me · หน้าอื่น = GET /tasks — ทั้งคู่แบ่งหน้าฝั่ง server */
  readonly isMine = this.route.snapshot.data['taskMode'] === 'me';
  readonly mode = signal<TasksPageMode>(this.isMine ? 'me' : 'all');
  readonly savingId = signal<number | null>(null);
  readonly filterProjectId = signal<number | null>(null);

  /** status '' = ทุกสถานะ · projectId 0 = ทุกโปรเจกต์ */
  readonly list = createServerList<TaskItem, { status: string; projectId: number }>({
    namespace: 'tasks',
    filters: { status: '', projectId: 0 },
    sortBy: 'dueDate',
    sortOrder: 'ASC',
    syncUrl: !this.isMine,
    fetch: ({ filters, ...req }) =>
      this.projectsApi.listTasksPage({
        ...req,
        status: (filters.status || undefined) as TaskStatus | undefined,
        projectId: filters.projectId || undefined,
      }),
  });

  /** ตัวเลขบนแท็บ — data.counts จาก BE (กรองตามคำค้นแล้ว) */
  readonly myCounts = signal<MyTasksCounts | null>(null);

  readonly myList = createServerList<TaskItem, { view: string }>({
    namespace: 'tasks-me',
    filters: { view: (this.route.snapshot.data['myView'] as MyTasksView | undefined) ?? 'all' },
    sortBy: 'dueDate',
    sortOrder: 'ASC',
    syncUrl: this.isMine,
    fetch: ({ filters, ...req }) =>
      this.projectsApi
        .listMyTasksPage({ ...req, tab: MY_VIEW_TAB[MY_VIEW_FROM_QUERY[filters.view] ?? 'all'] })
        .pipe(tap((page) => page.counts && this.myCounts.set(page.counts))),
  });

  readonly table = this.isMine ? this.myList : this.list;
  readonly myView = computed<MyTasksView>(
    () => MY_VIEW_FROM_QUERY[this.myList.filters().view] ?? 'all'
  );

  readonly searchControl = this.table.searchControl;

  readonly summary = signal<TaskSummary | null>(null);
  readonly statusChips = computed(() => {
    const s = this.summary();
    return TASK_STATUSES.map((status) => ({
      status,
      label: this.statusLabels[status],
      count: s ? (s.byStatus[status] ?? 0) : null,
    }));
  });

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly canUpdateTask = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.update');
  });

  /** ผู้ตรวจ / SUPER_ADMIN — ใช้ accountType หรือ permission ไม่ใช้ roles.length */
  readonly canReviewTasks = computed(() => {
    this.auth.session();
    return this.auth.canAccessTaskReviewQueue();
  });

  readonly meta = computed(() => PAGE_META[this.mode()]);

  readonly myTabs: { view: MyTasksView; label: string; alert?: boolean }[] = [
    { view: 'all', label: 'ทั้งหมด' },
    { view: 'todo', label: 'ต้องทำ', alert: true },
    { view: 'doing', label: 'กำลังดำเนินการ' },
    { view: 'review', label: 'รอตรวจ' },
    { view: 'done', label: 'เสร็จแล้ว' },
    { view: 'overdue', label: 'เกินกำหนด', alert: true },
  ];

  myTabCount(view: MyTasksView): number | null {
    return this.myCounts()?.[MY_VIEW_TAB[view]] ?? null;
  }

  readonly columns = computed(() => {
    if (this.mode() === 'review') {
      return ['title', 'project', 'assignee', 'dueDate', 'actions'];
    }
    if (this.mode() === 'me') {
      return ['title', 'project', 'assigner', 'dueDate', 'status', 'actions'];
    }
    return ['title', 'project', 'priority', 'assignee', 'dueDate', 'status', 'actions'];
  });

  ngOnInit(): void {
    this.syncQueryFilters(this.route.snapshot.queryParamMap);
    this.usersApi
      .loadForPicker(this.auth.currentUser(), { capability: 'TASK' })
      .subscribe({ error: () => undefined });
    this.table.start();
    if (!this.isMine) {
      this.loadSummary();
    }
    this.openTaskFromQuery(this.route.snapshot.queryParamMap.get('task'));
  }

  /** ?task=:id — มาจากกระดิ่งแจ้งเตือน (refType TASK) · เปิดกล่องงานแล้วล้าง query */
  private openTaskFromQuery(raw: string | null): void {
    const id = Number(raw);
    if (!raw || !Number.isInteger(id) || id <= 0) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { task: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.projectsApi.getTask(id).subscribe({
      next: (task) => this.openTask(task),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  private syncQueryFilters(params: {
    get(name: string): string | null;
  }): void {
    const qProject = Number(params.get('projectId'));
    this.filterProjectId.set(
      Number.isFinite(qProject) && qProject > 0 ? qProject : null
    );
  }

  setMyView(view: MyTasksView): void {
    this.myList.setFilter('view', view);
  }

  setStatusFilter(status: TaskStatus | ''): void {
    this.list.setFilter('status', status);
  }

  private loadSummary(): void {
    this.projectsApi
      .getTaskSummary(this.list.filters().projectId || undefined)
      .subscribe({ next: (s) => this.summary.set(s), error: () => this.summary.set(null) });
  }

  /** คอลัมน์ที่ server เรียงให้ได้ */
  canSort(key: TaskSortKey): boolean {
    return SERVER_SORT_KEYS.has(key);
  }

  toggleSort(key: TaskSortKey): void {
    if (SERVER_SORT_KEYS.has(key)) {
      this.table.toggleSort(key);
    }
  }

  sortIcon(key: TaskSortKey): string {
    return SERVER_SORT_KEYS.has(key) ? this.table.sortIcon(key) : '';
  }

  reload(): void {
    this.table.reload({ invalidate: true });
    if (!this.isMine) {
      this.loadSummary();
    }
  }

  statusLabel(status: TaskStatus): string {
    // งานของฉันที่ส่งตรวจแล้ว = งานอยู่ที่ผู้ตรวจ
    if (this.isMine && status === 'REVIEW') {
      return 'รอตรวจ';
    }
    return this.statusLabels[status];
  }

  priorityLabel(priority: TaskPriority): string {
    return this.priorityLabels[priority];
  }

  /** อ่านจากแถวที่ API คืนมาเท่านั้น — ห้ามแสดง #id */
  assigneeName(task: TaskItem): string {
    return task.assignedUser?.fullName?.trim() || '—';
  }

  assignerName(task: TaskItem): string {
    return task.assignedBy?.fullName?.trim() || '—';
  }

  /** ผู้รับผิดชอบงานนี้คือตัวเองหรือไม่ — ใช้กับปุ่มเริ่มงาน/ส่งตรวจ (สิทธิ์ตรวจใช้ auth.blocksSelfReview) */
  isOwnAssignment(task: TaskItem): boolean {
    const uid = this.auth.currentUser()?.id;
    return uid != null && task.assignedUserId === uid;
  }

  projectCode(task: TaskItem): string {
    return task.project?.code || '—';
  }

  projectName(task: TaskItem): string {
    return task.project?.name || `#${task.projectId}`;
  }

  projectStatusLabel(status: ProjectStatus | string): string {
    return this.projectStatusLabels[status as ProjectStatus] ?? status;
  }

  /**
   * ปุ่มเปลี่ยนสถานะในตาราง
   * - หน้าตรวจงานโปรเจกต์: ไม่มีปุ่มสถานะในแถว (ใช้「ตรวจงาน」อย่างเดียว)
   * - หน้างานที่มอบหมาย: ส่งตรวจได้ ห้ามทำเสร็จ/อนุมัติเอง
   */
  taskRowActions(task: TaskItem): RowAction[] {
    if (this.mode() === 'review') {
      if (!this.canReviewTasks() || this.auth.blocksSelfReview(task)) {
        return [];
      }
      return [{ label: 'ตรวจงาน', primary: true, icon: 'fact_check', run: () => this.openReview(task) }];
    }

    const busy = this.savingId() === task.id;
    const actions: RowAction[] = this.statusActions(task).map((action) => ({
      label: action.label,
      primary: action.kind === 'submit' || action.label === 'เริ่มงาน' || action.label === 'กลับมาทำ',
      disabled: busy,
      icon:
        action.kind === 'submit'
          ? 'fact_check'
          : action.label === 'พักงาน'
            ? 'pause'
            : 'play_arrow',
      run: () =>
        action.kind === 'submit'
          ? this.openSubmitReport(task)
          : this.changeStatus(task, action.status, action.kind),
    }));
    const editable = this.canEditTask(task);
    actions.push({
      label: editable ? 'แก้ไข' : 'รายละเอียด',
      icon: editable ? 'edit' : 'visibility',
      run: () => this.openTask(task),
    });
    return actions;
  }

  /** งานของฉันที่ส่งตรวจแล้วอยู่ที่ผู้ตรวจ — ดูได้อย่างเดียว */
  private canEditTask(task: TaskItem): boolean {
    return this.canUpdateTask() && !(this.isMine && task.status === 'REVIEW');
  }

  statusActions(task: TaskItem): { label: string; status: TaskStatus; kind: 'status' | 'submit' | 'review' }[] {
    if (this.mode() === 'review') {
      return [];
    }

    if (!this.canUpdateTask()) {
      return [];
    }

    if (this.mode() === 'me') {
      const actions: { label: string; status: TaskStatus; kind: 'status' | 'submit' | 'review' }[] = [];
      switch (task.status) {
        case 'TODO':
          actions.push({ label: 'เริ่มงาน', status: 'DOING', kind: 'status' });
          break;
        case 'DOING':
          actions.push({ label: 'พักงาน', status: 'WAITING', kind: 'status' });
          // ส่งตรวจได้หลังเข้าเฟสกำลังทำเท่านั้น
          actions.push({ label: 'ส่งตรวจ', status: 'REVIEW', kind: 'submit' });
          break;
        case 'WAITING':
          actions.push({ label: 'กลับมาทำ', status: 'DOING', kind: 'status' });
          break;
        default:
          break;
      }
      return actions;
    }

    switch (task.status) {
      case 'TODO':
        if (!this.isOwnAssignment(task) && this.canReviewTasks()) {
          return [];
        }
        return [{ label: 'เริ่มงาน', status: 'DOING', kind: 'status' }];
      case 'DOING': {
        if (!this.isOwnAssignment(task)) {
          return [];
        }
        return [
          { label: 'พักงาน', status: 'WAITING', kind: 'status' },
          { label: 'ส่งตรวจ', status: 'REVIEW', kind: 'submit' },
        ];
      }
      case 'WAITING': {
        if (!this.isOwnAssignment(task)) {
          return [];
        }
        return [{ label: 'กลับมาทำ', status: 'DOING', kind: 'status' }];
      }
      case 'REVIEW':
        return [];
      default:
        return [];
    }
  }

  changeStatus(
    task: TaskItem,
    status: TaskStatus,
    kind: 'status' | 'submit' | 'review' = 'status'
  ): void {
    if (this.mode() === 'review') {
      return;
    }
    if (!this.canUpdateTask()) {
      this.snack.open('ไม่มีสิทธิ์เปลี่ยนสถานะงาน (task.update)', 'ปิด', { duration: 3000 });
      return;
    }
    if (kind === 'review') {
      this.openReview(task);
      return;
    }
    // ส่งตรวจต้องผ่านฟอร์มรายงานเท่านั้น — ห้าม PATCH submit-review / status=REVIEW ตรง ๆ
    if (kind === 'submit' || status === 'REVIEW') {
      this.openSubmitReport(task);
      return;
    }
    if (this.mode() === 'me' && status === 'DONE') {
      this.snack.open('ผู้รับผิดชอบส่งตรวจได้เท่านั้น — รอผู้ตรวจอนุมัติ', 'ปิด', {
        duration: 3500,
      });
      return;
    }
    if (task.status === status) {
      return;
    }

    this.savingId.set(task.id);
    this.projectsApi.updateTaskStatus(task.id, status).subscribe({
      next: () => {
        this.savingId.set(null);
        this.snack.open(`เปลี่ยนสถานะเป็น「${this.statusLabel(status)}」แล้ว`, 'ปิด', {
          duration: 2500,
        });
        this.reload();
      },
      error: (err: Error) => {
        this.savingId.set(null);
        this.snack.open(err.message, 'ปิด', { duration: 4500 });
      },
    });
  }

  /** เปิดฟอร์มรายงานผลการทำงาน (ผู้รับผิดชอบ) — เฉพาะสถานะกำลังทำ (DOING) */
  openSubmitReport(task: TaskItem): void {
    if (task.status !== 'DOING') {
      this.snack.open('ส่งตรวจได้เมื่อเข้าเฟสกำลังทำแล้วเท่านั้น — กด「เริ่มงาน」ก่อน', 'ปิด', {
        duration: 3500,
      });
      return;
    }
    const ref = this.dialog.open(TaskSubmitReportDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { task },
    });
    ref.afterClosed().subscribe((ok) => {
      if (ok) {
        this.reload();
      }
    });
  }

  /** เปิด dialog ตรวจงาน — GET /tasks/:id แล้วอนุมัติ/ส่งกลับ */
  openReview(task: TaskItem): void {
    if (!this.canReviewTasks()) {
      this.snack.open('ไม่มีสิทธิ์ตรวจงาน', 'ปิด', { duration: 3000 });
      return;
    }
    if (this.auth.blocksSelfReview(task)) {
      this.snack.open('ผู้รับผิดชอบห้ามตรวจงานตัวเอง', 'ปิด', { duration: 3500 });
      return;
    }
    const ref = this.dialog.open(TaskReviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { taskId: task.id, seed: task },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) {
        this.reload();
      }
    });
  }

  openTask(task: TaskItem): void {
    if (this.mode() === 'review') {
      this.openReview(task);
      return;
    }
    const workflow =
      this.mode() === 'me'
        ? 'assignee'
        : this.canReviewTasks() && task.status === 'REVIEW' && !this.auth.blocksSelfReview(task)
          ? 'reviewer'
          : 'assignee';
    if (workflow === 'reviewer') {
      this.openReview(task);
      return;
    }
    const ref = this.dialog.open(TaskEditDialogComponent, {
      ...FORM_DIALOG,
      data: {
        projectId: task.projectId,
        task,
        readOnly: !this.canEditTask(task),
        workflow,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}
