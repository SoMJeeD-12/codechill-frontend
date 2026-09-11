import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { asPage, toHttpParams } from '../../core/http/api.util';
import { FollowUp } from '../../core/models/follow-up.model';
import {
  PROJECT_STATUS_LABELS,
  Project,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../core/models/project.model';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

interface SectionLoad<T> {
  visible: boolean;
  items: T[];
  total: number;
  error: string | null;
}

function emptySection<T>(): SectionLoad<T> {
  return { visible: false, items: [], total: 0, error: null };
}

@Component({
  selector: 'app-my-work-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTooltipModule,
    ThaiDatePipe,
  ],
  templateUrl: './my-work-page.component.html',
  styleUrl: './my-work-page.component.scss',
})
export class MyWorkPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  readonly user = this.auth.currentUser;
  readonly loading = signal(true);

  readonly tickets = signal<SectionLoad<Ticket>>(emptySection());
  readonly tasks = signal<SectionLoad<TaskItem>>(emptySection());
  readonly followUps = signal<SectionLoad<FollowUp>>(emptySection());
  readonly projects = signal<SectionLoad<Project>>(emptySection());

  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly ticketPriorityLabels = TICKET_PRIORITY_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly taskPriorityLabels = TASK_PRIORITY_LABELS;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;

  readonly canTickets = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.view');
  });
  readonly canTasks = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.view');
  });
  readonly canFollowUps = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('followup.view');
  });
  readonly canProjects = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('project.view');
  });

  readonly summaryParts = computed(() => {
    const parts: string[] = [];
    const t = this.tickets();
    if (t.visible) {
      const overdue = t.items.filter((x) => x.isOverdue).length;
      parts.push(
        overdue > 0
          ? `ใบแจ้งปัญหาค้าง ${t.items.length} (เลยกำหนด ${overdue})`
          : `ใบแจ้งปัญหาค้าง ${t.items.length}`
      );
    }
    const tasks = this.tasks();
    if (tasks.visible) {
      const overdue = tasks.items.filter((x) => x.isOverdue).length;
      parts.push(
        overdue > 0
          ? `งานย่อยค้าง ${tasks.items.length} (เลยกำหนด ${overdue})`
          : `งานย่อยค้าง ${tasks.items.length}`
      );
    }
    const f = this.followUps();
    if (f.visible) {
      const overdue = f.items.filter((x) => x.isOverdue).length;
      parts.push(
        overdue > 0
          ? `ต้องติดตาม ${f.items.length} (เลยกำหนด ${overdue})`
          : `ต้องติดตาม ${f.items.length}`
      );
    }
    return parts;
  });

  readonly hasAnySection = computed(
    () =>
      this.tickets().visible ||
      this.tasks().visible ||
      this.followUps().visible ||
      this.projects().visible
  );

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const userId = this.auth.currentUser()?.id;
    if (userId == null) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    const tickets$ = this.canTickets()
      ? this.loadTickets(userId)
      : of(emptySection<Ticket>());
    const tasks$ = this.canTasks()
      ? this.loadTasks(userId)
      : of(emptySection<TaskItem>());
    const followUps$ = this.canFollowUps()
      ? this.loadFollowUps(userId)
      : of(emptySection<FollowUp>());
    const projects$ = this.canProjects()
      ? this.loadProjects(userId)
      : of(emptySection<Project>());

    forkJoin({
      tickets: tickets$,
      tasks: tasks$,
      followUps: followUps$,
      projects: projects$,
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe(({ tickets, tasks, followUps, projects }) => {
        this.tickets.set(tickets);
        this.tasks.set(tasks);
        this.followUps.set(followUps);
        this.projects.set(projects);
      });
  }

  ticketStatusLabel(status: TicketStatus): string {
    return this.ticketStatusLabels[status] ?? status;
  }

  ticketPriorityLabel(priority: TicketPriority): string {
    return this.ticketPriorityLabels[priority] ?? priority;
  }

  taskStatusLabel(status: TaskStatus): string {
    return this.taskStatusLabels[status] ?? status;
  }

  taskPriorityLabel(priority: TaskPriority): string {
    return this.taskPriorityLabels[priority] ?? priority;
  }

  projectStatusLabel(status: Project['status']): string {
    return this.projectStatusLabels[status] ?? status;
  }

  private loadTickets(userId: number) {
    return this.http
      .get<Ticket[] | { items: Ticket[]; total?: number }>(`${this.api}/tickets/pending`, {
        params: toHttpParams({ assigneeId: userId, limit: 100 }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          return {
            visible: true,
            items: page.items,
            total: page.total,
            error: null,
          } satisfies SectionLoad<Ticket>;
        }),
        catchError((err) => of(this.sectionFromError<Ticket>(err)))
      );
  }

  private loadTasks(userId: number) {
    return this.http
      .get<TaskItem[] | { items: TaskItem[]; total?: number }>(`${this.api}/tasks`, {
        params: toHttpParams({ assignedUserId: userId, limit: 100 }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          const open = page.items.filter((t) => t.status !== 'DONE');
          return {
            visible: true,
            items: open,
            total: page.total,
            error: null,
          } satisfies SectionLoad<TaskItem>;
        }),
        catchError((err) => of(this.sectionFromError<TaskItem>(err)))
      );
  }

  private loadFollowUps(userId: number) {
    return this.http
      .get<FollowUp[] | { items: FollowUp[]; total?: number }>(`${this.api}/follow-ups`, {
        params: toHttpParams({
          assignedUserId: userId,
          status: 'PLANNED',
          limit: 100,
        }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          return {
            visible: true,
            items: page.items,
            total: page.total,
            error: null,
          } satisfies SectionLoad<FollowUp>;
        }),
        catchError((err) => of(this.sectionFromError<FollowUp>(err)))
      );
  }

  private loadProjects(userId: number) {
    return this.http
      .get<Project[] | { items: Project[]; total?: number }>(`${this.api}/projects`, {
        params: toHttpParams({ managerUserId: userId, limit: 100 }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          return {
            visible: true,
            items: page.items,
            total: page.total,
            error: null,
          } satisfies SectionLoad<Project>;
        }),
        catchError((err) => of(this.sectionFromError<Project>(err)))
      );
  }

  private sectionFromError<T>(err: unknown): SectionLoad<T> {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      return emptySection<T>();
    }
    const message =
      err instanceof HttpErrorResponse
        ? typeof err.error === 'object' &&
          err.error &&
          typeof (err.error as { message?: string }).message === 'string'
          ? (err.error as { message: string }).message
          : err.message
        : err instanceof Error
          ? err.message
          : 'โหลดไม่สำเร็จ';
    return { visible: true, items: [], total: 0, error: message };
  }
}
