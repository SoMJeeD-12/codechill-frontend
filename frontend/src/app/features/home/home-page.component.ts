import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { FollowUp } from '../../core/models/follow-up.model';
import {
  TASK_STATUS_LABELS,
  TaskItem,
} from '../../core/models/project.model';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
} from '../../core/models/ticket.model';
import { MaContract } from '../../core/models/ma.model';
import { Warranty } from '../../core/models/warranty.model';
import { AuthService } from '../../core/services/auth.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { TicketService } from '../../core/services/ticket.service';
import { WarrantyService } from '../../core/services/warranty.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

/** การ์ด "ต้องทำวันนี้" — กดแล้วไปรายการที่กรองไว้แล้ว */
export interface TodoCard {
  key: 'tickets' | 'tasks' | 'follow-ups' | 'expiring';
  label: string;
  count: number | null;
  icon: string;
  hint: string;
  route: string;
  queryParams: Record<string, string>;
  tone: 'urgent' | 'warn' | 'calm';
  visible: boolean;
}

const EXPIRING_DAYS = 30;

/**
 * หน้าแรก — เปิดมาแล้วต้องรู้ทันทีว่า "วันนี้ต้องทำอะไร"
 *
 * ชั้นบน = การ์ดต้องทำวันนี้ 4 ใบ (ตัวเลขรวมทั้งทีม) กดแล้วไปรายการที่กรองไว้แล้ว
 * ชั้นล่าง = งานของฉัน 3 กลุ่ม (ไม่แยกเมนู)
 */
@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ThaiDatePipe,
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly ticketsApi = inject(TicketService);
  private readonly projectsApi = inject(ProjectService);
  private readonly followUpsApi = inject(FollowUpService);
  private readonly warrantiesApi = inject(WarrantyService);
  private readonly maApi = inject(MaService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly ticketPriorityLabels = TICKET_PRIORITY_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly expiringDays = EXPIRING_DAYS;

  /* ——— ตัวเลขรวมทั้งทีม ——— */
  private readonly pendingTickets = signal<number | null>(null);
  private readonly overdueTasks = signal<number | null>(null);
  private readonly overdueFollowUps = signal<number | null>(null);
  private readonly expiringCover = signal<number | null>(null);

  /* ——— งานของฉัน ——— */
  readonly myTickets = signal<Ticket[]>([]);
  readonly myTasks = signal<TaskItem[]>([]);
  readonly myFollowUps = signal<FollowUp[]>([]);

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
  readonly canWarranties = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('warranty.view') || this.auth.hasPermissionCode('ma.view');
  });

  readonly todoCards = computed<TodoCard[]>(() => {
    const cards: TodoCard[] = [
      {
        key: 'tickets',
        label: 'ปัญหารอแก้',
        count: this.pendingTickets(),
        icon: 'support_agent',
        hint: 'ใบที่ยังไม่ปิดงาน',
        route: '/app/tickets',
        queryParams: { view: 'open' },
        tone: 'urgent',
        visible: this.canTickets(),
      },
      {
        key: 'tasks',
        label: 'งานเลยกำหนด',
        count: this.overdueTasks(),
        icon: 'assignment_late',
        hint: 'เลยวันครบกำหนดแล้ว',
        route: '/app/tasks/overdue',
        queryParams: {},
        tone: 'urgent',
        visible: this.canTasks(),
      },
      {
        key: 'follow-ups',
        label: 'ติดตามที่เลยกำหนด',
        count: this.overdueFollowUps(),
        icon: 'event_busy',
        hint: 'นัดติดตามที่ยังไม่ได้ทำ',
        route: '/app/follow-ups',
        queryParams: { overdue: 'true' },
        tone: 'warn',
        visible: this.canFollowUps(),
      },
      {
        key: 'expiring',
        label: 'ประกัน / MA ใกล้หมด',
        count: this.expiringCover(),
        icon: 'verified_user',
        hint: `ภายใน ${EXPIRING_DAYS} วัน`,
        route: '/app/warranties',
        queryParams: { expiring: String(EXPIRING_DAYS) },
        tone: 'warn',
        visible: this.canWarranties(),
      },
    ];
    return cards.filter((card) => card.visible);
  });

  readonly hasUrgentWork = computed(() =>
    this.todoCards().some((c) => (c.count ?? 0) > 0)
  );

  readonly myWorkTotal = computed(
    () => this.myTickets().length + this.myTasks().length + this.myFollowUps().length
  );

  readonly hasAnyMySection = computed(
    () => this.canTickets() || this.canTasks() || this.canFollowUps()
  );

  private loadedOnce = false;

  constructor() {
    // เปิดใบจากปุ่มลัดบนแถบบนขณะอยู่หน้าแรก — นับการ์ดใหม่ให้ทันที
    effect(() => {
      this.quickActions.ticketCreated();
      if (this.loadedOnce) {
        this.reload();
      }
    });
  }

  ngOnInit(): void {
    this.loadedOnce = true;
    this.reload();
  }

  reload(): void {
    const userId = this.auth.currentUser()?.id;
    this.loading.set(true);
    this.loadError.set(null);

    forkJoin({
      // ——— ตัวเลขรวม ———
      pendingTickets: this.canTickets()
        ? this.ticketsApi.listPending({ limit: 100 }).pipe(catchError(() => of(null)))
        : of(null),
      overdueTasks: this.canTasks()
        ? this.projectsApi.listOverdueTasks({ limit: 100 }).pipe(catchError(() => of(null)))
        : of(null),
      overdueFollowUps: this.canFollowUps()
        ? this.followUpsApi
            .list({ overdue: true, limit: 100 })
            .pipe(catchError(() => of(null)))
        : of(null),
      expiringWarranties: this.canWarranties()
        ? this.warrantiesApi
            .listExpiring({ days: EXPIRING_DAYS, limit: 100 })
            .pipe(catchError(() => of([] as Warranty[])))
        : of([] as Warranty[]),
      expiringMa: this.canWarranties()
        ? this.maApi
            .list({ expiringInDays: EXPIRING_DAYS, limit: 100 })
            .pipe(catchError(() => of([] as MaContract[])))
        : of([] as MaContract[]),

      // ——— งานของฉัน ———
      myTickets:
        this.canTickets() && userId
          ? this.ticketsApi
              .listPending({ assigneeId: userId, limit: 100 })
              .pipe(catchError(() => of([] as Ticket[])))
          : of([] as Ticket[]),
      myTasks:
        this.canTasks() && userId
          ? this.projectsApi
              .listAllTasks({ assignedUserId: userId, limit: 100 })
              .pipe(catchError(() => of([] as TaskItem[])))
          : of([] as TaskItem[]),
      myFollowUps:
        this.canFollowUps() && userId
          ? this.followUpsApi
              .list({ assignedUserId: userId, status: 'PLANNED', limit: 100 })
              .pipe(catchError(() => of([] as FollowUp[])))
          : of([] as FollowUp[]),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((data) => {
        this.pendingTickets.set(data.pendingTickets?.length ?? null);
        this.overdueTasks.set(data.overdueTasks?.length ?? null);
        this.overdueFollowUps.set(data.overdueFollowUps?.length ?? null);
        this.expiringCover.set(
          this.canWarranties()
            ? data.expiringWarranties.length + data.expiringMa.length
            : null
        );

        this.myTickets.set(data.myTickets);
        // งานที่ยังไม่เสร็จ — เรียงงานเลยกำหนดขึ้นก่อน
        this.myTasks.set(
          data.myTasks
            .filter((t) => t.status !== 'DONE')
            .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue))
            .slice(0, 8)
        );
        this.myFollowUps.set(
          [...data.myFollowUps]
            .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue))
            .slice(0, 8)
        );
      });
  }

  openCard(card: TodoCard): void {
    void this.router.navigate([card.route], { queryParams: card.queryParams });
  }

  greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'สวัสดีตอนเช้า';
    }
    if (hour < 17) {
      return 'สวัสดีตอนบ่าย';
    }
    return 'สวัสดีตอนเย็น';
  }
}
