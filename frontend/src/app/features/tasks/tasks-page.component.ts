import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  PROJECT_STATUS_LABELS,
  ProjectStatus,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { TaskKanbanBoardComponent } from '../projects/task-kanban-board.component';
import { TaskEditDialogComponent } from '../projects/task-edit-dialog.component';
import { TaskReviewDialogComponent } from '../projects/task-review-dialog.component';
import { TaskSubmitReportDialogComponent } from '../projects/task-submit-report-dialog.component';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { createTableSort } from '../../shared/utils/table-sort';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export type TasksPageMode =
  | 'all'
  | 'me'
  | 'unassigned'
  | 'doing'
  | 'review'
  | 'overdue'
  | 'board';

/** มุมมองย่อยในหน้างานของฉัน — ไม่กรอง REVIEW เพราะ /tasks/me ไม่คืนงานที่ส่งตรวจแล้ว */
export type MyTasksView = 'all' | 'todo' | 'doing' | 'done' | 'overdue';

const MY_VIEW_FROM_QUERY: Record<string, MyTasksView> = {
  todo: 'todo',
  unassigned: 'todo',
  doing: 'doing',
  done: 'done',
  overdue: 'overdue',
  all: 'all',
};

const PAGE_META: Record<TasksPageMode, { title: string; subtitle: string }> = {
  all: { title: 'งานทั้งหมด', subtitle: '' },
  me: { title: 'งานที่มอบหมาย', subtitle: '' },
  unassigned: { title: 'งานที่ยังไม่มอบหมาย', subtitle: '' },
  doing: { title: 'งานกำลังดำเนินการ', subtitle: '' },
  review: { title: 'งานรอตรวจ', subtitle: 'งานที่ส่งตรวจแล้ว รออนุมัติ' },
  overdue: { title: 'งานเกินกำหนด', subtitle: '' },
  board: { title: 'กระดานงาน', subtitle: '' },
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
    TaskKanbanBoardComponent,
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
  private readonly fb = inject(FormBuilder);

  readonly mode = signal<TasksPageMode>('all');
  readonly myView = signal<MyTasksView>('all');
  readonly loading = signal(true);
  readonly savingId = signal<number | null>(null);
  readonly tasks = signal<TaskItem[]>([]);
  readonly filterProjectId = signal<number | null>(null);
  readonly searchControl = this.fb.nonNullable.control('');
  readonly search = signal('');

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

  readonly myViewCounts = computed(() => {
    const rows = this.tasks();
    return {
      all: rows.length,
      todo: rows.filter((t) => t.status === 'TODO').length,
      doing: rows.filter((t) => t.status === 'DOING' || t.status === 'WAITING').length,
      done: rows.filter((t) => t.status === 'DONE').length,
      overdue: rows.filter((t) => !!t.isOverdue).length,
    };
  });

  readonly tableSort = createTableSort<
    'title' | 'project' | 'assignee' | 'assigner' | 'status' | 'priority' | 'dueDate' | 'startDate'
  >('dueDate');

  readonly displayedTasks = computed(() => {
    let rows = this.tasks();
    if (this.mode() === 'me') {
      switch (this.myView()) {
        case 'todo':
          rows = rows.filter((t) => t.status === 'TODO');
          break;
        case 'doing':
          rows = rows.filter((t) => t.status === 'DOING' || t.status === 'WAITING');
          break;
        case 'done':
          rows = rows.filter((t) => t.status === 'DONE');
          break;
        case 'overdue':
          rows = rows.filter((t) => !!t.isOverdue);
          break;
        default:
          break;
      }
    }
    const priorityRank: Record<TaskPriority, number> = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };
    return this.tableSort.apply(rows, (row, key) => {
      switch (key) {
        case 'title':
          return row.title;
        case 'project':
          return this.projectLabel(row);
        case 'assignee':
          return this.assigneeName(row);
        case 'assigner':
          return this.assignerName(row);
        case 'status':
          return this.statusLabel(row.status);
        case 'priority':
          return priorityRank[row.priority];
        case 'dueDate':
          return row.dueDate ? new Date(row.dueDate).getTime() : null;
        case 'startDate':
          return row.startDate ? new Date(row.startDate).getTime() : null;
      }
    });
  });

  readonly columns = computed(() => {
    if (this.mode() === 'review') {
      return ['title', 'project', 'assignee', 'dueDate', 'actions'];
    }
    if (this.mode() === 'me') {
      return ['title', 'project', 'assigner', 'dueDate', 'status', 'actions'];
    }
    return ['title', 'project', 'priority', 'assignee', 'dueDate', 'status', 'actions'];
  });

  readonly pager = createClientPager(this.displayedTasks);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => {
      this.search.set(v);
      this.reload();
    });

    this.route.data.subscribe((data) => {
      const mode = (data['taskMode'] as TasksPageMode) || 'all';
      this.mode.set(mode);
      const qProject = Number(this.route.snapshot.queryParamMap.get('projectId'));
      this.filterProjectId.set(
        Number.isFinite(qProject) && qProject > 0 ? qProject : null
      );
      if (mode === 'me') {
        const fromData = data['myView'] as MyTasksView | undefined;
        const fromQuery = this.route.snapshot.queryParamMap.get('view');
        this.applyViewFromQuery(fromQuery ?? fromData ?? null);
      } else {
        this.myView.set('all');
      }
      this.usersApi
        .loadForPicker(this.auth.currentUser(), {
          capability: mode === 'review' ? 'TASK_REVIEW' : 'TASK',
        })
        .subscribe({ error: () => undefined });
      this.reload();
    });

    this.route.queryParamMap.subscribe((params) => {
      if (this.mode() !== 'me') {
        return;
      }
      this.applyViewFromQuery(params.get('view'));
      this.pager.reset();
    });
  }

  setMyView(view: MyTasksView): void {
    this.myView.set(view);
    this.pager.reset();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: view === 'all' ? {} : { view },
      replaceUrl: true,
    });
  }

  toggleSort(
    key: 'title' | 'project' | 'assignee' | 'assigner' | 'status' | 'priority' | 'dueDate' | 'startDate'
  ): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(
    key: 'title' | 'project' | 'assignee' | 'assigner' | 'status' | 'priority' | 'dueDate' | 'startDate'
  ): string {
    return this.tableSort.sortIcon(key);
  }

  private applyViewFromQuery(raw: string | null): void {
    if (!raw) {
      this.myView.set('all');
      return;
    }
    if (
      raw === 'todo' ||
      raw === 'doing' ||
      raw === 'done' ||
      raw === 'overdue' ||
      raw === 'all'
    ) {
      this.myView.set(raw);
      return;
    }
    this.myView.set(MY_VIEW_FROM_QUERY[raw] ?? 'all');
  }

  reload(): void {
    const mode = this.mode();
    if (mode === 'board') {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    const q = this.search().trim() || undefined;
    const projectId = this.filterProjectId() ?? undefined;

    let req;
    if (mode === 'me') {
      // GET /api/tasks/me — ห้ามส่ง userId จาก client
      req = this.projectsApi.listMyTasks({
        limit: 100,
        search: q,
      });
    } else if (mode === 'overdue') {
      req = this.projectsApi.listOverdueTasks({ limit: 100, projectId });
    } else if (mode === 'unassigned') {
      req = this.projectsApi.listAllTasks({
        limit: 100,
        projectId,
        search: q,
        assignedUserId: null,
      });
    } else if (mode === 'doing') {
      req = this.projectsApi.listAllTasks({
        limit: 100,
        projectId,
        search: q,
        status: 'DOING',
      });
    } else if (mode === 'review') {
      // ผู้ตรวจ / SUPER_ADMIN — ห้ามใช้ /tasks/me
      req = this.projectsApi.listAllTasks({
        page: 1,
        limit: 20,
        projectId,
        search: q,
        status: 'REVIEW',
      });
    } else {
      req = this.projectsApi.listAllTasks({
        limit: 100,
        projectId,
        search: q,
      });
    }

    req.subscribe({
      next: (rows) => {
        for (const row of rows) {
          if (row.assignedBy) {
            this.usersApi.upsertLocal(row.assignedBy);
          }
          if (row.assignedUser) {
            this.usersApi.upsertLocal(row.assignedUser);
          }
        }
        this.tasks.set(rows);
        this.pager.reset();
        this.loading.set(false);
        this.enrichMissingAssigners(rows);
      },
      error: (err: Error) => {
        this.tasks.set([]);
        this.loading.set(false);
        this.snack.open(err.message || 'โหลดงานไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  /**
   * รายการงานมักส่งแค่ assignedByUserId หรือไม่ส่งชื่อ
   * — ดึง GET /tasks/:id แล้วถ้ายังไม่มีชื่อ ค่อย GET /users/:id
   */
  private enrichMissingAssigners(rows: TaskItem[]): void {
    const missing = rows
      .filter((t) => !t.assignedBy?.fullName?.trim())
      .slice(0, 15);
    if (!missing.length) {
      return;
    }

    forkJoin(
      missing.map((t) => this.projectsApi.getTask(t.id).pipe(catchError(() => of(null))))
    ).subscribe((details) => {
      const byId = new Map<number, TaskItem>();
      for (const detail of details) {
        if (detail) {
          byId.set(detail.id, detail);
          if (detail.assignedBy) {
            this.usersApi.upsertLocal(detail.assignedBy);
          }
        }
      }

      this.tasks.update((current) =>
        current.map((t) => {
          const detail = byId.get(t.id);
          if (!detail) {
            return t;
          }
          return {
            ...t,
            assignedByUserId: detail.assignedByUserId ?? t.assignedByUserId,
            assignedBy: detail.assignedBy ?? t.assignedBy,
          };
        })
      );

      const stillMissingIds = [
        ...new Set(
          this.tasks()
            .filter((t) => t.assignedByUserId && !t.assignedBy?.fullName?.trim())
            .map((t) => t.assignedByUserId as number)
            .filter((id) => !this.usersApi.getById(id)?.fullName)
        ),
      ].slice(0, 15);

      if (!stillMissingIds.length) {
        return;
      }

      forkJoin(
        stillMissingIds.map((id) => this.usersApi.get(id).pipe(catchError(() => of(null))))
      ).subscribe((users) => {
        for (const user of users) {
          if (user) {
            this.usersApi.upsertLocal(user);
          }
        }
        // trigger recompute ของ assignerName ผ่านอ้างอิงแคช — อัปเดต signal เบา ๆ
        this.tasks.update((list) =>
          list.map((t) => {
            const id = t.assignedByUserId;
            if (!id || t.assignedBy?.fullName?.trim()) {
              return t;
            }
            const cached = this.usersApi.getById(id);
            if (!cached?.fullName) {
              return t;
            }
            return {
              ...t,
              assignedBy: {
                id: cached.id,
                username: cached.username,
                fullName: cached.fullName,
              },
            };
          })
        );
      });
    });
  }

  statusLabel(status: TaskStatus): string {
    return this.statusLabels[status];
  }

  priorityLabel(priority: TaskPriority): string {
    return this.priorityLabels[priority];
  }

  assigneeName(task: TaskItem): string {
    if (task.assignedUser?.fullName) {
      return task.assignedUser.fullName;
    }
    if (!task.assignedUserId) {
      return 'ยังไม่มอบหมาย';
    }
    return this.usersApi.getById(task.assignedUserId)?.fullName ?? `#${task.assignedUserId}`;
  }

  assignerName(task: TaskItem): string {
    if (task.assignedBy?.fullName) {
      return task.assignedBy.fullName;
    }
    if (task.assignedByUserId) {
      const cached = this.usersApi.getById(task.assignedByUserId);
      if (cached?.fullName) {
        return cached.fullName;
      }
      return `#${task.assignedByUserId}`;
    }
    return 'ไม่ระบุ';
  }

  /** ผู้รับผิดชอบงานนี้คือตัวเองหรือไม่ — ห้ามอนุมัติงานตัวเอง */
  isOwnAssignment(task: TaskItem): boolean {
    const uid = this.auth.currentUser()?.id;
    return uid != null && task.assignedUserId === uid;
  }

  projectLabel(task: TaskItem): string {
    if (task.project) {
      return `${task.project.code ? task.project.code + ' · ' : ''}${task.project.name}`;
    }
    return `#${task.projectId}`;
  }

  projectStatusLabel(status: ProjectStatus | string): string {
    return this.projectStatusLabels[status as ProjectStatus] ?? status;
  }

  /**
   * ปุ่มเปลี่ยนสถานะในตาราง
   * - หน้างานรอตรวจ: ไม่มีปุ่มสถานะในแถว (ใช้「ตรวจงาน」อย่างเดียว)
   * - หน้างานที่มอบหมาย: ส่งตรวจได้ ห้ามทำเสร็จ/อนุมัติเอง
   */
  taskRowActions(task: TaskItem): RowAction[] {
    if (this.mode() === 'review') {
      if (!this.canReviewTasks() || this.isOwnAssignment(task)) {
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
    actions.push({
      label: this.canUpdateTask() ? 'แก้ไข' : 'รายละเอียด',
      icon: this.canUpdateTask() ? 'edit' : 'visibility',
      run: () => this.openTask(task),
    });
    return actions;
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
    if (this.isOwnAssignment(task)) {
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
        : this.canReviewTasks() && task.status === 'REVIEW' && !this.isOwnAssignment(task)
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
        readOnly: !this.canUpdateTask(),
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
