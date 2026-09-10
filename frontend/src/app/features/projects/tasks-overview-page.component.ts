import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  PROJECT_STATUS_LABELS,
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
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';

type BoardView = 'summary' | 'overdue' | 'dueSoon' | 'list';

@Component({
  selector: 'app-tasks-overview-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './tasks-overview-page.component.html',
  styleUrl: './tasks-overview-page.component.scss',
})
export class TasksOverviewPageComponent implements OnInit {
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly fb = inject(FormBuilder);

  readonly view = signal<BoardView>('summary');
  readonly loading = signal(true);
  readonly summary = signal<TaskSummary | null>(null);
  readonly overdue = signal<TaskItem[]>([]);
  readonly dueSoon = signal<TaskItem[]>([]);
  readonly tasks = signal<TaskItem[]>([]);
  readonly withinDays = signal(7);

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly statuses = TASK_STATUSES;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly users = this.usersApi.users;

  readonly statusFilter = signal<TaskStatus | 'ALL'>('ALL');
  readonly assigneeFilter = signal<number | 'ALL' | 'UNASSIGNED'>('ALL');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly search = signal('');

  readonly columns = [
    'title',
    'project',
    'priority',
    'assignee',
    'dueDate',
    'status',
  ];

  readonly statusBars = computed(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }
    const max = Math.max(...Object.values(s.byStatus), 1);
    return this.statuses.map((st) => ({
      status: st,
      label: this.statusLabels[st],
      count: s.byStatus[st] ?? 0,
      overdue: st === 'DONE' ? 0 : (s.overdueByStatus[st as Exclude<TaskStatus, 'DONE'>] ?? 0),
      percent: Math.round(((s.byStatus[st] ?? 0) / max) * 100),
    }));
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.usersApi.loadForPicker().subscribe({ error: () => undefined });
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    forkJoin({
      summary: this.projectsApi.getTaskSummary().pipe(catchError(() => of(null))),
      overdue: this.projectsApi.listOverdueTasks({ limit: 100 }).pipe(catchError(() => of([]))),
      dueSoon: this.projectsApi
        .listDueSoonTasks({ withinDays: this.withinDays(), limit: 100 })
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ summary, overdue, dueSoon }) => {
        this.summary.set(summary);
        this.overdue.set(overdue);
        this.dueSoon.set(dueSoon);
        this.loading.set(false);
        if (this.view() === 'list') {
          this.loadList();
        }
      },
      error: () => this.loading.set(false),
    });
  }

  setView(view: BoardView): void {
    this.view.set(view);
    if (view === 'list') {
      this.loadList();
    }
  }

  drillStatus(status: TaskStatus): void {
    this.statusFilter.set(status);
    this.assigneeFilter.set('ALL');
    this.setView('list');
  }

  drillAssignee(assignedUserId: number | null): void {
    this.assigneeFilter.set(assignedUserId == null ? 'UNASSIGNED' : assignedUserId);
    this.statusFilter.set('ALL');
    this.setView('list');
  }

  loadList(): void {
    const status = this.statusFilter();
    const assignee = this.assigneeFilter();
    const q = this.search().trim();
    this.projectsApi
      .listAllTasks({
        limit: 100,
        status: status === 'ALL' ? undefined : status,
        assignedUserId: typeof assignee === 'number' ? assignee : undefined,
        search: q || undefined,
      })
      .subscribe({
        next: (rows) => {
          let list = rows;
          if (assignee === 'UNASSIGNED') {
            list = list.filter((t) => t.assignedUserId == null);
          }
          this.tasks.set(list);
        },
        error: () => this.tasks.set([]),
      });
  }

  applyListFilters(): void {
    this.loadList();
  }

  setWithinDays(days: number): void {
    this.withinDays.set(days);
    this.projectsApi.listDueSoonTasks({ withinDays: days, limit: 100 }).subscribe({
      next: (rows) => this.dueSoon.set(rows),
      error: () => this.dueSoon.set([]),
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
      return `#${task.project.id} · ${task.project.name}`;
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

  displayRows(): TaskItem[] {
    const v = this.view();
    if (v === 'overdue') {
      return this.overdue();
    }
    if (v === 'dueSoon') {
      return this.dueSoon();
    }
    return this.tasks();
  }
}
