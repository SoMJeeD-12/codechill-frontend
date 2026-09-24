import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';
import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  PROJECT_STATUS_LABELS,
  Project,
  ProjectStatus,
  TASK_PRIORITIES,
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
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { TaskEditDialogComponent } from './task-edit-dialog.component';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const DONE_PAGE_SIZE = 20;
const OTHER_LIMIT = 100;

@Component({
  selector: 'app-task-kanban-board',
  standalone: true,
  imports: [
    RouterLink,
    DragDropModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './task-kanban-board.component.html',
  styleUrl: './task-kanban-board.component.scss',
})
export class TaskKanbanBoardComponent implements OnInit, OnChanges {
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** null = งานทั้งบริษัท */
  @Input() projectId: number | null = null;
  /** true เมื่อเป็นบอร์ดทั้งบริษัท — แสดงตัวกรองโครงการ */
  @Input() showProjectFilter = false;

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly users = this.usersApi.assignableTask;

  readonly summary = signal<TaskSummary | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly columnTasks = signal<Record<TaskStatus, TaskItem[]>>({
    TODO: [],
    DOING: [],
    WAITING: [],
    REVIEW: [],
    DONE: [],
  });
  readonly columnLoading = signal<Partial<Record<TaskStatus, boolean>>>({});
  readonly donePage = signal(1);
  readonly doneHasMore = signal(false);

  readonly projectFilter = signal<number | 'ALL'>('ALL');
  readonly assigneeFilter = signal<number | 'ALL' | 'UNASSIGNED'>('ALL');
  readonly priorityFilter = signal<TaskPriority | 'ALL'>('ALL');

  readonly canDrag = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.update');
  });

  readonly canCreateTask = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.create');
  });

  readonly activeProjectId = computed(() => this.effectiveProjectId());

  ngOnInit(): void {
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe({
      error: () => undefined,
    });
    if (this.showProjectFilter) {
      this.projectsApi.listProjects().subscribe({
        next: (list) => this.projects.set(list),
        error: () => this.projects.set([]),
      });
    }
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange) {
      this.reload();
    }
  }

  reload(): void {
    this.donePage.set(1);
    this.loadSummary();
    for (const status of this.statuses) {
      this.loadColumn(status, 1, false);
    }
  }

  applyFilters(): void {
    this.donePage.set(1);
    this.loadSummary();
    for (const status of this.statuses) {
      this.loadColumn(status, 1, false);
    }
  }

  loadMoreDone(): void {
    if (!this.doneHasMore() || this.columnLoading()['DONE']) {
      return;
    }
    const next = this.donePage() + 1;
    this.loadColumn('DONE', next, true);
  }

  columnCount(status: TaskStatus): number {
    return this.summary()?.byStatus?.[status] ?? this.columnTasks()[status].length;
  }

  columnOverdue(status: TaskStatus): number {
    if (status === 'DONE') {
      return 0;
    }
    return this.summary()?.overdueByStatus?.[status] ?? 0;
  }

  onDrop(event: CdkDragDrop<TaskItem[]>, targetStatus: TaskStatus): void {
    if (!this.canDrag()) {
      return;
    }
    if (event.previousContainer === event.container) {
      // เรียงในคอลัมน์เดียวกัน — ไม่เรียก PATCH /tasks/:id/order
      const list = [...event.container.data];
      const [moved] = list.splice(event.previousIndex, 1);
      list.splice(event.currentIndex, 0, moved);
      this.patchColumn(targetStatus, list);
      return;
    }

    const previousStatus = this.statusFromDropId(event.previousContainer.id);
    if (!previousStatus || previousStatus === targetStatus) {
      return;
    }

    const task = event.previousContainer.data[event.previousIndex];
    if (!task) {
      return;
    }

    const prevList = [...event.previousContainer.data];
    const nextList = [...event.container.data];
    transferArrayItem(prevList, nextList, event.previousIndex, event.currentIndex);

    const optimistic = { ...task, status: targetStatus };
    nextList[event.currentIndex] = optimistic;
    this.patchColumn(previousStatus, prevList);
    this.patchColumn(targetStatus, this.sortTasks(nextList));

    this.projectsApi.updateTaskStatus(task.id, targetStatus).subscribe({
      next: () => {
        this.reload();
      },
      error: (err: Error) => {
        // revert
        const revertPrev = this.columnTasks()[previousStatus].filter((t) => t.id !== task.id);
        const revertNext = this.columnTasks()[targetStatus].filter((t) => t.id !== task.id);
        revertPrev.splice(event.previousIndex, 0, task);
        this.patchColumn(previousStatus, this.sortTasks(revertPrev));
        this.patchColumn(targetStatus, this.sortTasks(revertNext));
        this.snack.open(err.message || 'อัปเดตสถานะไม่สำเร็จ', 'ปิด', { duration: 3500 });
        this.loadSummary();
      },
    });
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
      return task.project.name;
    }
    return `#${task.projectId}`;
  }

  isClosedProject(task: TaskItem): boolean {
    const st = task.project?.status;
    return st === 'CLOSED' || st === 'CANCELLED';
  }

  projectStatusLabel(status: ProjectStatus | string): string {
    return this.projectStatusLabels[status as ProjectStatus] ?? status;
  }

  priorityLabel(priority: TaskPriority): string {
    return this.priorityLabels[priority];
  }

  trackTask(_: number, task: TaskItem): number {
    return task.id;
  }

  openCreateTask(): void {
    const projectId = this.activeProjectId();
    if (!projectId) {
      this.snack.open('เลือกโปรเจกต์ก่อนจึงเพิ่มงานได้', 'ปิด', { duration: 3000 });
      return;
    }
    if (!this.canCreateTask()) {
      this.snack.open('ไม่มีสิทธิ์เพิ่มงาน', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(TaskEditDialogComponent, {
      ...FORM_DIALOG,
      data: { projectId, task: null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  private loadSummary(): void {
    const pid = this.effectiveProjectId();
    this.projectsApi
      .getTaskSummary(pid ?? undefined)
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  private loadColumn(status: TaskStatus, page: number, append: boolean): void {
    this.columnLoading.update((m) => ({ ...m, [status]: true }));
    const assignee = this.assigneeFilter();
    const priority = this.priorityFilter();
    const limit = status === 'DONE' ? DONE_PAGE_SIZE : OTHER_LIMIT;

    this.projectsApi
      .listAllTasks({
        status,
        projectId: this.effectiveProjectId() ?? undefined,
        assignedUserId: typeof assignee === 'number' ? assignee : undefined,
        priority: priority === 'ALL' ? undefined : priority,
        limit,
        page: status === 'DONE' ? page : 1,
      })
      .pipe(catchError(() => of([] as TaskItem[])))
      .subscribe((rows) => {
        let list = rows;
        if (assignee === 'UNASSIGNED') {
          list = list.filter((t) => t.assignedUserId == null);
        }
        list = this.sortTasks(list);

        if (status === 'DONE') {
          this.donePage.set(page);
          this.doneHasMore.set(rows.length >= DONE_PAGE_SIZE);
          if (append) {
            const existing = this.columnTasks()['DONE'];
            const ids = new Set(existing.map((t) => t.id));
            const merged = [...existing, ...list.filter((t) => !ids.has(t.id))];
            this.patchColumn('DONE', this.sortTasks(merged));
          } else {
            this.patchColumn('DONE', list);
          }
        } else {
          this.patchColumn(status, list);
        }
        this.columnLoading.update((m) => ({ ...m, [status]: false }));
      });
  }

  private effectiveProjectId(): number | null {
    if (this.projectId != null) {
      return this.projectId;
    }
    if (this.showProjectFilter) {
      const f = this.projectFilter();
      return typeof f === 'number' ? f : null;
    }
    return null;
  }

  private patchColumn(status: TaskStatus, tasks: TaskItem[]): void {
    this.columnTasks.update((all) => ({ ...all, [status]: tasks }));
  }

  private sortTasks(tasks: TaskItem[]): TaskItem[] {
    return [...tasks].sort((a, b) => {
      const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (byPriority !== 0) {
        return byPriority;
      }
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
  }

  private statusFromDropId(id: string): TaskStatus | null {
    const raw = id.replace(/^kanban-/, '') as TaskStatus;
    return this.statuses.includes(raw) ? raw : null;
  }
}
