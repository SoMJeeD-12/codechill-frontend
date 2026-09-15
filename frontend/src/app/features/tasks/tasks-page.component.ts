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
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { TaskKanbanBoardComponent } from '../projects/task-kanban-board.component';
import { TaskEditDialogComponent } from '../projects/task-edit-dialog.component';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';

export type TasksPageMode =
  | 'all'
  | 'me'
  | 'unassigned'
  | 'doing'
  | 'review'
  | 'overdue'
  | 'board';

/** มุมมองย่อยในหน้างานของฉัน */
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

const PAGE_META: Record<TasksPageMode, { title: string; subtitle: string }> = {
  all: {
    title: 'งานทั้งหมด',
    subtitle: 'งานย่อยทุกโปรเจค — แยกจากหน้ารายละเอียดโปรเจคและการส่งมอบ',
  },
  me: {
    title: 'งานของฉัน',
    subtitle: 'งานที่ระบบมอบหมายให้คุณ — ไม่สามารถเลือกดูงานของคนอื่นจากหน้านี้',
  },
  unassigned: {
    title: 'งานที่ยังไม่มอบหมาย',
    subtitle: 'งานที่ยังไม่มีผู้รับผิดชอบ',
  },
  doing: {
    title: 'งานกำลังดำเนินการ',
    subtitle: 'สถานะ「กำลังทำ」ทั้งระบบ',
  },
  review: {
    title: 'งานรอตรวจ',
    subtitle: 'รายการสถานะ REVIEW ทั้งระบบ — อนุมัติหรือส่งกลับแก้ไข',
  },
  overdue: {
    title: 'งานเกินกำหนด',
    subtitle: 'ใช้ flag isOverdue จาก Backend',
  },
  board: {
    title: 'กระดานงาน',
    subtitle: 'มุมมองคัมบังของงานย่อย',
  },
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
      review: rows.filter((t) => t.status === 'REVIEW').length,
      done: rows.filter((t) => t.status === 'DONE').length,
      overdue: rows.filter((t) => !!t.isOverdue).length,
    };
  });

  readonly displayedTasks = computed(() => {
    const rows = this.tasks();
    if (this.mode() !== 'me') {
      return rows;
    }
    switch (this.myView()) {
      case 'todo':
        return rows.filter((t) => t.status === 'TODO');
      case 'doing':
        return rows.filter((t) => t.status === 'DOING' || t.status === 'WAITING');
      case 'review':
        return rows.filter((t) => t.status === 'REVIEW');
      case 'done':
        return rows.filter((t) => t.status === 'DONE');
      case 'overdue':
        return rows.filter((t) => !!t.isOverdue);
      default:
        return rows;
    }
  });

  readonly columns = computed(() => {
    if (this.mode() === 'review') {
      return ['title', 'assignee', 'project', 'dueDate', 'status', 'actions'];
    }
    if (this.mode() === 'me') {
      return [
        'title',
        'project',
        'description',
        'assignee',
        'status',
        'priority',
        'startDate',
        'dueDate',
        'isOverdue',
        'completedAt',
        'actions',
      ];
    }
    return ['title', 'project', 'priority', 'assignee', 'dueDate', 'status', 'actions'];
  });

  readonly pager = createClientPager(this.displayedTasks);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => {
      this.search.set(v);
      this.reload();
    });
    this.usersApi.loadForPicker(this.auth.currentUser()).subscribe({ error: () => undefined });

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

  private applyViewFromQuery(raw: string | null): void {
    if (!raw) {
      this.myView.set('all');
      return;
    }
    if (
      raw === 'todo' ||
      raw === 'doing' ||
      raw === 'review' ||
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
        this.tasks.set(rows);
        this.pager.reset();
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.tasks.set([]);
        this.loading.set(false);
        this.snack.open(err.message || 'โหลดงานไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
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
   * ปุ่มเปลี่ยนสถานะ
   * - หน้างานของฉัน (ผู้รับผิดชอบ): ส่งตรวจได้ ห้ามทำเสร็จเอง
   * - หน้างานรอตรวจ (ผู้ตรวจ): อนุมัติ/ทำเสร็จ หรือ ส่งกลับแก้ไข
   */
  statusActions(task: TaskItem): { label: string; status: TaskStatus }[] {
    if (!this.canUpdateTask()) {
      return [];
    }

    if (this.mode() === 'review') {
      if (task.status !== 'REVIEW' || !this.canReviewTasks()) {
        return [];
      }
      return [
        { label: 'อนุมัติ/ทำเสร็จ', status: 'DONE' },
        { label: 'ส่งกลับแก้ไข', status: 'DOING' },
      ];
    }

    if (this.mode() === 'me') {
      // ผู้รับผิดชอบ — ไม่มีปุ่มทำเสร็จ
      switch (task.status) {
        case 'TODO':
          return [
            { label: 'เริ่มงาน', status: 'DOING' },
            { label: 'ส่งตรวจ', status: 'REVIEW' },
          ];
        case 'DOING':
          return [
            { label: 'พักงาน', status: 'WAITING' },
            { label: 'ส่งตรวจ', status: 'REVIEW' },
          ];
        case 'WAITING':
          return [
            { label: 'กลับมาทำ', status: 'DOING' },
            { label: 'ส่งตรวจ', status: 'REVIEW' },
          ];
        case 'REVIEW':
        case 'DONE':
        default:
          return [];
      }
    }

    // โหมดอื่น (งานทั้งหมด ฯลฯ) — ตามสิทธิ์ทั่วไป
    switch (task.status) {
      case 'TODO':
        return [{ label: 'เริ่มงาน', status: 'DOING' }];
      case 'DOING':
        return [
          { label: 'พักงาน', status: 'WAITING' },
          { label: 'ส่งตรวจ', status: 'REVIEW' },
        ];
      case 'WAITING':
        return [
          { label: 'กลับมาทำ', status: 'DOING' },
          { label: 'ส่งตรวจ', status: 'REVIEW' },
        ];
      case 'REVIEW':
        if (!this.canReviewTasks()) {
          return [];
        }
        return [
          { label: 'อนุมัติ/ทำเสร็จ', status: 'DONE' },
          { label: 'ส่งกลับแก้ไข', status: 'DOING' },
        ];
      default:
        return [];
    }
  }

  changeStatus(task: TaskItem, status: TaskStatus): void {
    if (!this.canUpdateTask()) {
      this.snack.open('ไม่มีสิทธิ์เปลี่ยนสถานะงาน (task.update)', 'ปิด', { duration: 3000 });
      return;
    }
    if (this.mode() === 'me' && status === 'DONE') {
      this.snack.open('ผู้รับผิดชอบส่งตรวจได้เท่านั้น — รอผู้ตรวจอนุมัติ', 'ปิด', {
        duration: 3500,
      });
      return;
    }
    if (this.mode() === 'review' && !this.canReviewTasks()) {
      this.snack.open('ไม่มีสิทธิ์ตรวจงาน', 'ปิด', { duration: 3000 });
      return;
    }
    if (task.status === status) {
      return;
    }
    this.savingId.set(task.id);
    this.projectsApi.updateTaskStatus(task.id, status).subscribe({
      next: () => {
        this.savingId.set(null);
        const msg =
          status === 'REVIEW'
            ? 'ส่งตรวจแล้ว — สถานะรอตรวจ'
            : status === 'DONE'
              ? 'อนุมัติแล้ว — งานเสร็จสมบูรณ์'
              : status === 'DOING' && task.status === 'REVIEW'
                ? 'ส่งกลับแก้ไขแล้ว'
                : `เปลี่ยนสถานะเป็น「${this.statusLabel(status)}」แล้ว`;
        this.snack.open(msg, 'ปิด', { duration: 2500 });
        this.reload();
      },
      error: (err: Error) => {
        this.savingId.set(null);
        this.snack.open(err.message, 'ปิด', { duration: 4500 });
      },
    });
  }

  openTask(task: TaskItem): void {
    const workflow =
      this.mode() === 'review'
        ? 'reviewer'
        : this.mode() === 'me'
          ? 'assignee'
          : this.canReviewTasks() && task.status === 'REVIEW'
            ? 'reviewer'
            : 'assignee';
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
