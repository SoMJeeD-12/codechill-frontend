import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
export type MyTasksView =
  | 'all'
  | 'todo'
  | 'doing'
  | 'review'
  | 'done'
  | 'overdue';

const PAGE_META: Record<TasksPageMode, { title: string; subtitle: string }> = {
  all: {
    title: 'งานทั้งหมด',
    subtitle: 'งานย่อยทุกโปรเจค — แยกจากหน้ารายละเอียดโปรเจคและการส่งมอบ',
  },
  me: {
    title: 'งานของฉัน',
    subtitle: 'งานที่ได้รับมอบหมาย — กรองตามผู้ใช้ที่ล็อกอินอยู่',
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
    subtitle: 'สถานะ「รอตรวจ」ทั้งระบบ',
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
    if (this.mode() === 'me') {
      return [
        'title',
        'project',
        'description',
        'assignee',
        'status',
        'priority',
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
      this.myView.set('all');
      const qProject = Number(this.route.snapshot.queryParamMap.get('projectId'));
      this.filterProjectId.set(
        Number.isFinite(qProject) && qProject > 0 ? qProject : null
      );
      this.reload();
    });
  }

  setMyView(view: MyTasksView): void {
    this.myView.set(view);
    this.pager.reset();
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
    const meId = this.auth.currentUser()?.id;

    let req;
    if (mode === 'me') {
      if (!meId) {
        this.tasks.set([]);
        this.loading.set(false);
        this.snack.open('ไม่พบผู้ใช้ที่ล็อกอิน', 'ปิด', { duration: 3000 });
        return;
      }
      // ตาม contract ล่าสุด: GET /api/tasks?assignedUserId={currentUserId}
      req = this.projectsApi.listAllTasks({
        limit: 100,
        search: q,
        assignedUserId: meId,
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
      req = this.projectsApi.listAllTasks({
        limit: 100,
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

  /** ปุ่มเปลี่ยนสถานะ — เฉพาะผู้มี task.update */
  statusActions(task: TaskItem): { label: string; status: TaskStatus }[] {
    if (!this.canUpdateTask()) {
      return [];
    }
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
        return [
          { label: 'ทำเสร็จ', status: 'DONE' },
          { label: 'กลับไปแก้ไข', status: 'DOING' },
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
    if (task.status === status) {
      return;
    }
    this.savingId.set(task.id);
    this.projectsApi.updateTaskStatus(task.id, status).subscribe({
      next: (updated) => {
        this.savingId.set(null);
        this.tasks.update((list) =>
          list.map((t) => (t.id === updated.id ? updated : t))
        );
        this.snack.open(`เปลี่ยนสถานะเป็น「${this.statusLabel(status)}」แล้ว`, 'ปิด', {
          duration: 2500,
        });
      },
      error: (err: Error) => {
        this.savingId.set(null);
        this.snack.open(err.message, 'ปิด', { duration: 4500 });
      },
    });
  }

  openTask(task: TaskItem): void {
    const ref = this.dialog.open(TaskEditDialogComponent, {
      ...FORM_DIALOG,
      data: {
        projectId: task.projectId,
        task,
        readOnly: !this.canUpdateTask(),
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}
