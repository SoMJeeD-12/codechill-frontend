import { Location } from '@angular/common';
import { Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import {
  BILLING_TYPE_LABELS,
  BillingType,
  RESOLUTION_RESULT_LABELS,
  ResolutionResult,
  TICKET_STATUS_LABELS,
  TICKET_STEPPER_STATUSES,
  ticketStatusLabel,
  Ticket,
  TicketResolution,
  TicketStatus,
  ticketTimelineFromHistory,
  isIncompleteResolutionResult,
  latestTicketResolution,
  splitTicketDescription,
} from '../../core/models/ticket.model';
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, formatDocumentFileSize } from '../../core/models/document.model';
import { AttachmentService } from '../../core/services/attachment.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { ProjectService } from '../../core/services/project.service';
import {
  TicketDemoOverlayService,
} from '../../core/services/ticket-demo-overlay.service';
import { TicketService } from '../../core/services/ticket.service';
import type { TicketConfirmationPrintPayload } from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { navigateBack } from '../../core/utils/navigation.util';
import { formatThaiDateTime } from '../../core/utils/date.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';
import { UserOptionComponent } from '../../shared/components/user-option.component';
import { StatusBarComponent } from '../../shared/components/status-bar.component';
import {
  TicketReturnSupportDialogComponent,
  TicketReturnSupportDialogData,
  TicketReviewDialogResult,
} from './ticket-return-support-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import type { PageEvent } from '@angular/material/paginator';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { EntityAttachmentsComponent } from '../../shared/components/entity-attachments.component';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { EMPTY, Observable, concat, of, throwError } from 'rxjs';
import { catchError, map, switchMap, toArray } from 'rxjs/operators';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

const TIMELINE_PREVIEW_COUNT = 5;
const RESOLUTION_PAGE_SIZE = 10;

@Component({
  selector: 'app-ticket-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatDialogModule,
    StatusBarComponent,
    TablePaginatorComponent,
    ListLoadingBarComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './ticket-detail-page.component.html',
  styleUrl: './ticket-detail-page.component.scss',
})
export class TicketDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly ticketsApi = inject(TicketService);
  private readonly demoOverlay = inject(TicketDemoOverlayService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly notificationInbox = inject(NotificationInboxService);

  readonly ticket = signal<Ticket | null>(null);
  readonly resolutions = signal<TicketResolution[]>([]);
  readonly resolutionSearch = signal('');
  readonly resolutionSearchControl = this.fb.nonNullable.control('');
  readonly notFound = signal(false);
  readonly loading = signal(true);
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly users = this.usersApi.assignableTicket;
  readonly canResolve = computed(() => this.auth.hasPermission('tickets', 'resolve'));
  readonly canAssign = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.assign');
  });
  readonly canReopen = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.reopen');
  });
  readonly canChangeResolver = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.assign');
  });
  /** PATCH /tickets/:id/close — สถานะที่ปิดได้ให้ BE ตัดสิน (ปฏิเสธจะได้ข้อความกลับมา) */
  readonly canCloseTicket = computed(() => {
    this.auth.session();
    const t = this.ticket();
    return !!t && t.status !== 'CLOSED' && this.auth.hasPermissionCode('ticket.close');
  });
  readonly closing = signal(false);

  /** ผู้รับผิดชอบใบนี้เท่านั้นที่กดเริ่มได้ (BE ตรวจอีกชั้น) */
  readonly canStartTicket = computed(() => {
    this.auth.session();
    this.demoOverlay.state();
    const t = this.ticket();
    const me = this.auth.currentUser();
    if (!t || !me || !t.assignedUserId || t.assignedUserId !== me.id) {
      return false;
    }
    return this.demoOverlay.effectiveStatus(t) === 'ASSIGNED';
  });

  /**
   * แอดมิน/ผู้ดูแลสูงสุดบันทึกงานเองได้ทุกขั้นก่อนแก้ไขเสร็จ
   * ตอนบันทึก: รับคิว (ถ้ายังไม่มีแอดมินรับ) → มอบหมายให้ตัวเอง → เริ่มงาน → บันทึกรอบ
   */
  readonly adminCanSelfResolve = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    if (!t || !this.canAssign() || !this.canResolve()) {
      return false;
    }
    // BE ไม่ให้มอบหมายจาก RECEIVED ตรง ๆ — ซัพพอร์ตต้องส่งเข้าคิวแอดมินก่อน
    const shown = this.displayStatus();
    return (
      shown === 'WAITING_ADMIN' ||
      shown === 'ASSIGNED' ||
      shown === 'IN_PROGRESS' ||
      shown === 'REOPENED'
    );
  });

  /** แยก description ออกจากบรรทัด「เปิดกลับมาอีกครั้ง」ที่ BE ต่อมา */
  readonly descriptionParts = computed(() =>
    splitTicketDescription(this.ticket()?.description)
  );

  /** ย่อรายละเอียดที่แจ้งเมื่อยาวเกิน ~8 บรรทัด */
  readonly reportedDetailExpanded = signal(false);

  /** ย่อรายการอาการกลับมา — ค่าเริ่มต้นโชว์แค่ครั้งล่าสุด */
  readonly showAllReopenNotes = signal(false);

  reportedDetail(): string {
    const base = this.descriptionParts().base.trim();
    const title = this.ticket()?.title.trim() ?? '';
    if (!base || base === title) {
      return '';
    }
    return base;
  }

  reportedDetailLong(): boolean {
    const text = this.reportedDetail();
    return text.split('\n').length > 8 || text.length > 420;
  }

  toggleReportedDetail(): void {
    this.reportedDetailExpanded.update((open) => !open);
  }

  /** บันทึกที่ระบบต่อท้าย (เปิดกลับมา / ตรวจไม่ผ่าน) ใหม่→เก่า พร้อมเลขครั้งต่อชนิด */
  readonly reopenNoteRows = computed(() => {
    const counts = { reopen: 0, reject: 0 };
    return this.descriptionParts()
      .notes.map((note, i) => ({
        key: i,
        kind: note.kind,
        index: ++counts[note.kind],
        text: note.text,
      }))
      .reverse();
  });

  readonly visibleReopenNotes = computed(() => {
    const rows = this.reopenNoteRows();
    if (this.showAllReopenNotes() || rows.length <= 2) {
      return rows;
    }
    return rows.slice(0, 2);
  });

  /** รอบถัดไปหลังเปิดกลับมา (resolutionCount เดิม + 1) */
  readonly nextRound = computed(() => (this.ticket()?.resolutionCount ?? 0) + 1);

  /** สถานะที่โชว์ (รวมขั้น ASSIGNED ตัวอย่าง + PARTIAL/FAILED ยังไม่จบ) */
  readonly displayStatus = computed((): TicketStatus => {
    this.demoOverlay.state();
    const t = this.ticket();
    return t ? this.demoOverlay.effectiveStatus(t) : 'RECEIVED';
  });

  /** ป้ายสถานะ — เน้นแก้ไขบางส่วน / ยังไม่สำเร็จ เมื่อยังทำต่อ */
  readonly statusBarLabel = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    if (!t) {
      return this.statusLabels['RECEIVED'];
    }
    return (
      this.demoOverlay.incompleteStatusLabel(t) ??
      ticketStatusLabel(this.displayStatus())
    );
  });

  readonly statusBarAttr = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    return t ? this.demoOverlay.statusAttr(t) : this.displayStatus();
  });

  /** ค่าบริการเป็นครั้ง — API หรือ mock overlay */
  readonly displayExtraCharge = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    if (!t || t.billingType !== 'ONE_TIME') {
      return null;
    }
    return this.demoOverlay.effectiveExtraCharge(t);
  });

  readonly demoBanner = computed(() => null);

  readonly stepperSteps = computed(() => {
    const shown = this.displayStatus();
    const order = TICKET_STEPPER_STATUSES;
    const idx =
      shown === 'REOPENED'
        ? order.indexOf('RECEIVED')
        : Math.max(0, order.indexOf(shown));
    return order.map((status, i) => ({
      status,
      label: this.statusLabels[status],
      state: i < idx ? 'done' : i === idx ? 'current' : 'todo',
    }));
  });

  readonly stepperCaption = computed(() => {
    const steps = this.stepperSteps();
    const idx = steps.findIndex((s) => s.state === 'current');
    if (idx < 0) {
      return null;
    }
    return {
      index: idx + 1,
      total: steps.length,
      label: steps[idx].label,
      next: steps[idx + 1]?.label ?? null,
    };
  });

  readonly timelineEvents = computed(() => ticketTimelineFromHistory(this.ticket()?.history));

  /** ย่อไทม์ไลน์ — โชว์เหตุการณ์ล่าสุดก่อน ไม่ให้หน้ายาวเกิน */
  readonly timelinePreviewCount = TIMELINE_PREVIEW_COUNT;
  readonly timelineExpanded = signal(false);
  readonly visibleTimelineEvents = computed(() => {
    const all = this.timelineEvents();
    if (this.timelineExpanded() || all.length <= TIMELINE_PREVIEW_COUNT) {
      return all;
    }
    return all.slice(-TIMELINE_PREVIEW_COUNT);
  });
  readonly hiddenTimelineCount = computed(() =>
    Math.max(0, this.timelineEvents().length - TIMELINE_PREVIEW_COUNT)
  );

  /** PARTIAL/FAILED ล่าสุดแต่ใบยัง IN_PROGRESS — ใช้แถบ workflow รวมสถานะ+CTA */
  readonly isIncompleteWork = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    if (!t || this.displayStatus() !== 'IN_PROGRESS') {
      return false;
    }
    const last = latestTicketResolution(t);
    return !!(last && isIncompleteResolutionResult(last.result));
  });

  /**
   * แถบขั้นถัดไป — โชว์เฉพาะตอนมีปุ่มที่ต้องกด
   * (รับงานรอบใหม่ / ปิดงาน / ทำต่อหลัง partial)
   * CLOSED / เริ่มดำเนินการ: ใช้ปุ่มที่หัวหน้าเท่านั้น ไม่ซ้ำแถบเหลือง
   */
  readonly ticketNextHint = computed(() => {
    const t = this.ticket();
    if (!t) {
      return null;
    }
    const shown = this.displayStatus();

    if (shown === 'ASSIGNED') {
      // ปุ่ม「เริ่มดำเนินการ」/「เปลี่ยนผู้รับผิดชอบ」อยู่ที่หัวแล้ว — ไม่ซ้ำแถบเหลือง
      return null;
    }

    if (t.status === 'REOPENED') {
      if (this.canAssign()) {
        return {
          tone: 'warn' as const,
          title: 'ปัญหาเดิมกลับมาแล้ว — รอรับงานรอบใหม่',
          detail: `เปิดงานครั้งที่ ${this.nextRound()} ในใบเดิมนี้ · กด「รับงานรอบใหม่」เพื่อเลือกผู้รับผิดชอบ`,
          actions: [
            { id: 'pickup' as const, label: 'รับงานรอบใหม่', primary: true },
          ],
        };
      }
      return {
        tone: 'warn' as const,
        title: 'ปัญหาเดิมกลับมาแล้ว — รอแอดมินมอบหมาย',
        detail: `ใบนี้อยู่สถานะรอรับงานรอบใหม่ (งานครั้งที่ ${this.nextRound()})`,
        actions: [],
      };
    }

    if (shown === 'IN_PROGRESS') {
      const last = latestTicketResolution(t);
      if (last && isIncompleteResolutionResult(last.result)) {
        const actions: {
          id: 'add-resolution' | 'reassign';
          label: string;
          primary: boolean;
        }[] = [];
        if (this.canResolve()) {
          actions.push({
            id: 'add-resolution',
            label: 'บันทึกงานแก้ไขต่อ',
            primary: true,
          });
        }
        if (this.canAssign()) {
          actions.push({
            id: 'reassign',
            label: 'ส่งต่อผู้รับผิดชอบ',
            primary: false,
          });
        }
        return {
          tone: 'warn' as const,
          title:
            last.result === 'PARTIAL'
              ? 'แก้ไขบางส่วน — ยังไม่จบ'
              : 'รอบล่าสุดยังไม่สำเร็จ',
          detail:
            'ใบยังเปิดอยู่ · ทำต่อแล้วบันทึกรอบใหม่เป็น「สำเร็จ」เมื่อจบ หรือส่งต่อให้อีกคน',
          actions,
        };
      }
    }

    if (shown === 'RESOLVED') {
      const actions: {
        id: 'print-last';
        label: string;
        primary: boolean;
      }[] = [];
      if (this.resolutions()[0]) {
        actions.push({
          id: 'print-last',
          label: 'พิมพ์ใบยืนยันรอบล่าสุด',
          primary: false,
        });
      }
      if (!actions.length) {
        return null;
      }
      return {
        tone: 'ok' as const,
        title: 'แก้ไขเรียบร้อยแล้ว — รอส่งให้ซัพพอร์ต',
        detail:
          'ตรวจผลแก้แล้วกด「ส่งให้ซัพพอร์ต」ที่หัวข้อ · ซัพพอร์ตแจ้งลูกค้าแล้วระบบจะปิดใบให้เอง',
        actions,
      };
    }

    return null;
  });

  readonly resolutionColumns = [
    'round',
    'rootCause',
    'detail',
    'result',
    'hoursSpent',
    'resolver',
    'resolvedAt',
    'actions',
  ];

  readonly filteredResolutions = computed(() => {
    const q = this.resolutionSearch().trim().toLowerCase();
    const list = this.resolutions();
    if (!q) {
      return list;
    }
    return list.filter((r) =>
      [
        r.rootCause,
        r.detail,
        this.resultLabels[r.result],
        String(r.hoursSpent ?? ''),
        this.userName(r.resolvedByUserId),
        r.resolvedAt,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly resolutionsPager = createClientPager(
    this.filteredResolutions,
    RESOLUTION_PAGE_SIZE,
    [5, 10, 20]
  );

  readonly canAddResolution = computed(
    () =>
      (this.adminCanSelfResolve() && !this.isIncompleteWork()) ||
      (this.canResolve() &&
        this.displayStatus() === 'IN_PROGRESS' &&
        !!this.ticket()?.assignedUserId &&
        !this.isIncompleteWork())
  );

  private readonly resolutionHistoryTpl = viewChild<TemplateRef<unknown>>('resolutionHistory');

  private ticketId = 0;

  openResolutionHistory(): void {
    const tpl = this.resolutionHistoryTpl();
    if (tpl) {
      this.dialog.open(tpl, { ...FORM_DIALOG, autoFocus: false });
    }
  }

  goBack(): void {
    navigateBack(this.location, this.router, '/app/tickets');
  }

  toggleReopenNotes(): void {
    this.showAllReopenNotes.update((v) => !v);
  }

  toggleTimelineExpanded(): void {
    this.timelineExpanded.update((v) => !v);
  }

  ngOnInit(): void {
    this.resolutionSearchControl.valueChanges.subscribe((v) => {
      this.resolutionSearch.set(v);
      this.resolutionsPager.reset();
    });
    this.usersApi
      .loadForPicker(this.auth.currentUser(), { capability: 'TICKET' })
      .subscribe();

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!id) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      if (this.ticketId === id) {
        return;
      }
      this.ticketId = id;
      this.loadTicket();
    });
  }

  loadTicket(): void {
    this.loading.set(true);
    this.ticketsApi.get(this.ticketId).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.notificationInbox.markReadByRef('TICKET', ticket.id);
        this.resolutions.set(
          [...(ticket.resolutions ?? [])].sort((a, b) => b.round - a.round)
        );
        this.demoOverlay.syncIncompleteWorkFromTicket(ticket);
        this.showAllReopenNotes.set(false);
        this.reportedDetailExpanded.set(false);
        this.timelineExpanded.set(false);
        this.resolutionsPager.reset();
        this.notFound.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  customerName(): string {
    const ticket = this.ticket();
    const id = ticket?.customerId;
    if (!id) {
      return '—';
    }
    return ticket?.customer?.name ?? this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  projectName(): string {
    const ticket = this.ticket();
    const id = ticket?.projectId;
    if (!id) {
      return '—';
    }
    const p = ticket?.project ?? this.projectsApi.getProject(id);
    if (!p) {
      return `#${id}`;
    }
    return p.code ? `${p.code} · ${p.name}` : p.name;
  }

  userName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  ticketStatusLabel(status: TicketStatus): string {
    return ticketStatusLabel(status);
  }

  /** ข้อความรองของแถบสถานะ */
  statusDetail(t: Ticket): string {
    const n = t.resolutionCount || 0;
    const shown = this.displayStatus();
    const last = latestTicketResolution(t);
    if (shown === 'RECEIVED') {
      return 'รอซัพพอร์ตส่งเข้าคิวแอดมิน';
    }
    if (shown === 'WAITING_ADMIN') {
      return t.claimedByAdminUserId
        ? 'แอดมินรับเรื่องแล้ว — รอมอบหมายผู้รับผิดชอบ'
        : 'อยู่ในคิวแอดมิน — รอแอดมินรับเรื่อง';
    }
    if (shown === 'WAITING_SUPPORT') {
      return `แอดมินตรวจผ่านแล้ว · รวมแก้ ${n} ครั้ง — รอซัพพอร์ตแจ้งลูกค้า แล้วระบบจะปิดใบให้เอง`;
    }
    if (shown === 'ASSIGNED') {
      return 'มอบหมายแล้ว — รอผู้รับผิดชอบกด「เริ่มงาน」';
    }
    if (t.status === 'REOPENED') {
      return `พร้อมเริ่มงานครั้งที่ ${this.nextRound()} — กด「รับงานรอบใหม่」ด้านล่าง`;
    }
    if (shown === 'IN_PROGRESS' && last && isIncompleteResolutionResult(last.result)) {
      return last.result === 'PARTIAL'
        ? `แก้ไขบางส่วน — ยังทำต่อหรือส่งต่อได้ · รวมแก้ ${n} ครั้ง`
        : `ยังไม่สำเร็จ — ทำต่อหรือส่งต่อได้ · รวมแก้ ${n} ครั้ง`;
    }
    if (shown === 'IN_PROGRESS' && n > 0) {
      return `กำลังทำงานครั้งที่ ${this.nextRound()} · แก้ไปแล้ว ${n} ครั้งก่อนหน้า`;
    }
    if (shown === 'RESOLVED') {
      return `งานล่าสุดเสร็จแล้ว · รวมแก้ ${n} ครั้ง — รอแอดมินตรวจแล้วส่งให้ซัพพอร์ต`;
    }
    if (t.status === 'CLOSED') {
      return `ปิดแล้ว · มีงานแก้ไข ${n} ครั้งในใบนี้`;
    }
    return n > 0 ? `มีงานแก้ไขแล้ว ${n} ครั้ง` : 'ยังไม่เริ่มงานแก้ไข';
  }

  runTicketHintAction(
    id: 'pickup' | 'reopen' | 'print-last' | 'start' | 'add-resolution' | 'reassign'
  ): void {
    if (id === 'start') {
      this.startAssignedWork();
      return;
    }
    if (id === 'pickup') {
      this.pickupReopened();
      return;
    }
    if (id === 'add-resolution') {
      this.openAddResolution();
      return;
    }
    if (id === 'reassign') {
      this.changeAssignee();
      return;
    }
    if (id === 'print-last') {
      const last = this.resolutions()[0];
      if (last) {
        this.printResolutionConfirm(last);
      }
    }
  }

  billingLabel(type: BillingType): string {
    return this.billingLabels[type];
  }

  resultLabel(result: ResolutionResult): string {
    return this.resultLabels[result];
  }

  shortText(value: string | null | undefined, max = 60): string {
    const text = (value ?? '').trim();
    if (!text) {
      return '—';
    }
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  serviceHours(): string {
    const t = this.ticket();
    if (!t?.reportedAt) {
      return '—';
    }
    const start = new Date(t.reportedAt).getTime();
    if (Number.isNaN(start)) {
      return '—';
    }
    if (t.closedAt) {
      const end = new Date(t.closedAt).getTime();
      if (Number.isNaN(end)) {
        return '—';
      }
      const hours = Math.max(0, (end - start) / 3_600_000);
      return `${hours.toFixed(1)} ชม.`;
    }
    const hours = Math.max(0, (Date.now() - start) / 3_600_000);
    return `กำลังดำเนินการ (ผ่านมา ${hours.toFixed(1)} ชม.)`;
  }

  openAddResolution(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์บันทึกรอบการแก้ไข', 'ปิด', { duration: 3000 });
      return;
    }
    const shown = this.displayStatus();
    if (shown === 'CLOSED') {
      this.snack.open(
        'ใบปิดงานแล้ว — ถ้าปัญหากลับมา ให้กด「เปิดใบแจ้งปัญหา」แล้วเลือก「ปัญหาเดิมกลับมา」',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    const selfTake = this.adminCanSelfResolve();
    if (shown === 'ASSIGNED' && !selfTake) {
      this.snack.open('กด「เริ่มงาน」ก่อน แล้วค่อยบันทึกการแก้ไข', 'ปิด', {
        duration: 4000,
      });
      return;
    }
    if (
      !selfTake &&
      (shown === 'RECEIVED' || shown === 'REOPENED' || !this.ticket()?.assignedUserId)
    ) {
      this.snack.open(
        shown === 'RECEIVED'
          ? 'ใบนี้ยังไม่ถูกส่งเข้าคิวแอดมิน — รอซัพพอร์ตส่งเข้าคิวก่อน'
          : 'ใบนี้ยังไม่ได้มอบหมาย — รอแอดมินมอบหมายงานก่อนจึงจะบันทึกการแก้ไขได้',
        'ปิด',
        { duration: 4000 }
      );
      return;
    }
    if (shown === 'RESOLVED' || shown === 'WAITING_SUPPORT') {
      this.snack.open(
        shown === 'RESOLVED'
          ? 'แก้ไขเรียบร้อยแล้ว — รอแอดมินตรวจและส่งให้ซัพพอร์ต'
          : 'รอซัพพอร์ตแจ้งลูกค้า — ระบบจะปิดใบให้เอง',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    const ref = this.dialog.open(TicketResolutionFormDialogComponent, {
      ...FORM_DIALOG,
      data: {
        ticketId: this.ticketId,
        canChangeResolver: this.canChangeResolver(),
        canHandoff: this.canAssign(),
        defaultResolverId:
          this.auth.currentUser()?.id ?? this.ticket()?.assignedUserId ?? 0,
        currentAssigneeId: this.ticket()?.assignedUserId ?? null,
        projectId: this.ticket()?.projectId ?? null,
        projectName: this.projectName(),
        ticketNo: this.ticket()?.ticketNo || `ใบ #${this.ticketId}`,
        selfTake,
        claimedByAdminUserId: this.ticket()?.claimedByAdminUserId ?? null,
      } satisfies TicketResolutionFormData,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadTicket();
      }
    });
  }

  openResolutionDetail(r: TicketResolution): void {
    const ticket = this.ticket();
    if (!ticket) {
      return;
    }
    const ref = this.dialog.open(TicketWorkRoundDetailDialogComponent, {
      ...FORM_DIALOG,
      data: {
        ticket,
        resolution: r,
        customerName: this.customerName(),
        projectName: this.projectName(),
        resolverName:
          r.resolvedBy?.fullName?.trim() || this.userName(r.resolvedByUserId),
        ticketNo: ticket.ticketNo || `ใบ #${ticket.id}`,
      } satisfies TicketWorkRoundDetailDialogData,
    });
    ref.afterClosed().subscribe(() => this.loadTicket());
  }

  /** พิมพ์ใบยืนยัน — GET /tickets/:id/confirmation-print?round= */
  printResolutionConfirm(r: TicketResolution): void {
    const ticket = this.ticket();
    if (!ticket) {
      return;
    }
    this.ticketsApi.getConfirmationPrint(ticket.id, r.round).subscribe({
      next: (payload) => printTicketConfirmationFromPayload(payload),
      error: (err: Error) =>
        this.snack.open(err.message || 'โหลดใบยืนยันไม่สำเร็จ', 'ปิด', {
          duration: 4000,
        }),
    });
  }

  sendToSupport(): void {
    if (!this.canAssign()) {
      this.snack.open('ไม่มีสิทธิ์ส่งให้ซัพพอร์ต', 'ปิด', { duration: 3000 });
      return;
    }
    const ticket = this.ticket();
    if (!ticket || this.displayStatus() !== 'RESOLVED') {
      this.snack.open(
        'ส่งให้ซัพพอร์ตได้เมื่อรอบล่าสุดเป็น「สำเร็จ」แล้ว — สำเร็จบางส่วน/ไม่สำเร็จยังต้องทำต่อ',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    this.dialog
      .open(TicketReturnSupportDialogComponent, {
        width: '680px',
        maxWidth: '96vw',
        autoFocus: false,
        data: {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo || `ใบ #${ticket.id}`,
          title: ticket.title,
          receiverName: this.userName(ticket.receivedByUserId),
          assigneeName: this.userName(ticket.assignedUserId),
          showOpenLink: false,
        } satisfies TicketReturnSupportDialogData,
      })
      .afterClosed()
      .subscribe((result: TicketReviewDialogResult | undefined) => {
        if (!result) {
          return;
        }
        this.snack.open(
          result === 'approved'
            ? 'ส่งให้ซัพพอร์ตแล้ว — รอซัพพอร์ตแจ้งลูกค้า'
            : 'ส่งกลับให้ผู้แก้แล้ว — ใบกลับเป็นกำลังดำเนินการ',
          'ปิด',
          { duration: 3000 }
        );
        this.loadTicket();
      });
  }

  closeTicket(): void {
    const ticket = this.ticket();
    if (!ticket || !this.canCloseTicket()) {
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ปิดใบแจ้งปัญหา',
      message: 'ปิดใบนี้แล้วใบจะออกจากคิวงาน — ถ้าปัญหากลับมาเปิดใบเดิมกลับมาได้',
      subject: `${ticket.ticketNo || 'ใบ #' + ticket.id} · ${ticket.title}`,
      confirmLabel: 'ปิดงาน',
      danger: false,
      icon: 'task_alt',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.closing.set(true);
      this.ticketsApi.close(ticket.id).subscribe({
        next: () => {
          this.closing.set(false);
          this.snack.open('ปิดใบแจ้งปัญหาแล้ว', 'ปิด', { duration: 3000 });
          this.loadTicket();
        },
        error: (err: Error) => {
          this.closing.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 5000 });
        },
      });
    });
  }

  /** ASSIGNED → PATCH /tickets/:id/start (ผู้รับผิดชอบเท่านั้น) */
  startAssignedWork(): void {
    if (!this.canStartTicket()) {
      this.snack.open('เฉพาะผู้รับผิดชอบเท่านั้นที่เริ่มงานได้', 'ปิด', {
        duration: 3500,
        panelClass: ['app-toast', 'app-toast--info'],
        horizontalPosition: 'end',
        verticalPosition: 'bottom',
      });
      return;
    }
    this.ticketsApi.start(this.ticketId).subscribe({
      next: () => {
        this.demoOverlay.markStarted(this.ticketId);
        this.snack.open('เริ่มดำเนินการแล้ว', 'ปิด', {
          duration: 3500,
          panelClass: ['app-toast', 'app-toast--success'],
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
        });
        this.loadTicket();
      },
      error: (err: Error) =>
        this.snack.open(err.message, 'ปิด', {
          duration: 4500,
          panelClass: ['app-toast', 'app-toast--error'],
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
        }),
    });
  }

  /** REOPENED → รับงานรอบใหม่ (ส่งคนเดิมก็ได้) */
  pickupReopened(): void {
    this.pickAssigneeAndAssign('รับงานรอบใหม่แล้ว — สถานะ「รอเริ่มงาน」', {
      preferCurrent: true,
    });
  }

  /** IN_PROGRESS / ASSIGNED → เปลี่ยนผู้รับผิดชอบ */
  changeAssignee(): void {
    this.pickAssigneeAndAssign('เปลี่ยนผู้รับผิดชอบแล้ว');
  }

  private pickAssigneeAndAssign(
    successMsg: string,
    opts?: { preferCurrent?: boolean }
  ): void {
    if (!this.canAssign()) {
      this.snack.open('ไม่มีสิทธิ์มอบหมายงาน', 'ปิด', { duration: 3000 });
      return;
    }
    const current = this.ticket();
    const me = this.auth.currentUser();
    const defaultId =
      (opts?.preferCurrent ? current?.assignedUserId : null) ??
      current?.assignedUserId ??
      me?.id ??
      null;

    this.usersApi.loadForPicker(me, { capability: 'TICKET' }).subscribe({
      next: (users) => {
        if (!users.length) {
          this.snack.open(
            'ยังไม่มีรายชื่อผู้รับผิดชอบในระบบ — เพิ่มผู้ใช้ที่มีสิทธิ์รับใบปัญหาก่อน',
            'ปิด',
            { duration: 4500 }
          );
          return;
        }
        const ref = this.dialog.open(TicketAssignDialogComponent, {
          ...FORM_DIALOG_COMPACT,
          data: {
            users: users.map(toAssignDialogUser),
            defaultUserId: defaultId,
            title: opts?.preferCurrent ? 'รับงานรอบใหม่' : 'เลือกผู้รับผิดชอบ',
            currentAssigneeId: current?.assignedUserId ?? null,
            meId: me?.id ?? null,
          },
        });
        ref.afterClosed().subscribe((userId: number | null | undefined) => {
          if (userId == null) {
            return;
          }
          this.ticketsApi.assign(this.ticketId, userId).subscribe({
            next: (ticket) => {
              if (ticket.status !== 'ASSIGNED') {
                this.demoOverlay.markAssigned(this.ticketId);
              } else {
                this.demoOverlay.markStarted(this.ticketId);
              }
              this.snack.open(successMsg, 'ปิด', { duration: 2800 });
              this.loadTicket();
            },
            error: (err: Error) =>
              this.snack.open(err.message, 'ปิด', { duration: 4500 }),
          });
        });
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
    });
  }
}

/* ——— Add resolution dialog ——— */

export interface TicketResolutionFormData {
  ticketId: number;
  canChangeResolver: boolean;
  /** ส่งต่อผู้รับผิดชอบได้เมื่อเลือกสำเร็จบางส่วน / ไม่สำเร็จ */
  canHandoff: boolean;
  defaultResolverId: number;
  currentAssigneeId: number | null;
  /** ไฟล์ที่แนบในรอบ → เก็บเป็นเอกสารของโปรเจกต์นี้ (ไม่มีโปรเจกต์ → แนบกับรอบแก้ไข) */
  projectId: number | null;
  projectName: string;
  ticketNo: string;
  /** แอดมินบันทึกเองโดยยังไม่มีผู้แก้ — รับคิว + มอบหมายให้ตัวเอง + เริ่มงาน ก่อนบันทึกรอบ */
  selfTake: boolean;
  claimedByAdminUserId: number | null;
}

@Component({
  selector: 'app-ticket-resolution-form-dialog',
  standalone: true,
  imports: [
    UserOptionComponent,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>เพิ่มรอบการแก้ไข</h2>
    <mat-dialog-content>
      @if (data.selfTake) {
        <p class="hint">
          เมื่อบันทึก ระบบจะบันทึกชื่อคุณเป็นแอดมินผู้รับคิว (ถ้ายังไม่มี) และเป็นผู้แก้ของใบนี้
        </p>
      }
      <form [formGroup]="form" class="dlg-form" id="ticket-resolution-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>สาเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="rootCause"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>วิธีแก้ไข</mat-label>
          <textarea matInput rows="2" formControlName="detail"></textarea>
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>เวลาที่ใช้ (ชม.)</mat-label>
            <input matInput type="number" step="0.5" min="0" formControlName="hoursSpent" placeholder="ยังไม่กรอก" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ผลลัพธ์</mat-label>
            <mat-select formControlName="result">
              @for (r of results; track r) {
                <mat-option [value]="r">{{ resultLabels[r] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้แก้ไขรอบนี้</mat-label>
          <mat-select formControlName="resolvedByUserId">
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id"><app-user-option [userId]="u.id" [name]="u.fullName" /></mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (showHandoff()) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>ส่งต่องานให้ (ไม่บังคับ)</mat-label>
            <mat-select formControlName="handoffUserId">
              <mat-option [value]="null">— ไม่เปลี่ยนผู้รับผิดชอบ —</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id"><app-user-option [userId]="u.id" [name]="u.fullName" /></mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        @if (canUploadFiles) {
        <div class="files">
          <div class="files__head">
            <div>
              <strong>ไฟล์แนบ</strong>
              <span class="files__hint">แนบไว้กับรอบแก้ไขนี้</span>
            </div>
            <button
              mat-stroked-button
              type="button"
              [disabled]="saving()"
              (click)="fileInput.click()"
            >
              <mat-icon>attach_file</mat-icon>
              เลือกไฟล์
            </button>
            <input
              #fileInput
              type="file"
              multiple
              hidden
              [accept]="fileAccept"
              (change)="onFilesPicked($event)"
            />
          </div>
          @if (files().length) {
            <ul class="files__list">
              @for (f of files(); track $index) {
                <li>
                  <mat-icon>description</mat-icon>
                  <span class="files__name" [title]="f.name">{{ f.name }}</span>
                  <span class="files__size">{{ fileSize(f.size) }}</span>
                  <button
                    mat-icon-button
                    type="button"
                    [disabled]="saving()"
                    aria-label="เอาไฟล์ออก"
                    (click)="removeFile($index)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="files__empty">ยังไม่ได้เลือกไฟล์ (ไม่บังคับ)</p>
          }
        </div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="ticket-resolution-form"
        [disabled]="saving()"
      >
        @if (saving()) {
          กำลังบันทึก…
        } @else {
          บันทึกรอบนี้
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin: 0 0 0.75rem;
      color: var(--app-accent);
      font-size: 0.82rem;
    }
    .dlg-form {
      display: grid;
      gap: 0.6rem;
      padding-top: 0.5rem;
      min-width: min(720px, 92vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .full {
      width: 100%;
    }
    .files {
      border: 1px dashed var(--app-control-line);
      border-radius: 10px;
      padding: 0.6rem 0.75rem;
    }
    .files__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .files__hint {
      display: block;
      font-size: 0.8rem;
      color: var(--app-muted);
    }
    .files__list {
      list-style: none;
      margin: 0.5rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.25rem;
    }
    .files__list li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    .files__list mat-icon {
      color: var(--app-muted);
    }
    .files__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .files__size {
      color: var(--app-muted);
      font-size: 0.8rem;
    }
    .files__empty {
      margin: 0.4rem 0 0;
      font-size: 0.8rem;
      color: var(--app-subtle);
    }
  `,
})
export class TicketResolutionFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly demoOverlay = inject(TicketDemoOverlayService);
  private readonly snack = inject(MatSnackBar);
  private readonly attachmentsApi = inject(AttachmentService);
  private readonly ref = inject(MatDialogRef<TicketResolutionFormDialogComponent, boolean>);
  readonly data = inject<TicketResolutionFormData>(MAT_DIALOG_DATA);

  readonly canUploadFiles = this.auth.hasPermissionCode('file.upload');
  readonly fileAccept = DOCUMENT_ACCEPT;
  readonly files = signal<File[]>([]);
  readonly saving = signal(false);
  private claimWarning: string | null = null;

  readonly users = this.usersApi.assignableTicket;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  /** PARTIAL เลิกให้เลือกแล้ว — label ยังคงไว้แสดงรอบเก่าที่เคยบันทึก */
  readonly results: ResolutionResult[] = ['SUCCESS', 'FAILED'];

  readonly form = this.fb.nonNullable.group({
    rootCause: [''],
    detail: ['', Validators.required],
    /** ว่าง = ยังไม่ได้กรอก (ไม่ใช่ 1 ชม.) */
    hoursSpent: [null as number | null, Validators.min(0)],
    result: ['SUCCESS' as ResolutionResult],
    resolvedByUserId: [
      {
        value: this.data.selfTake
          ? this.auth.currentUser()?.id || 0
          : this.data.defaultResolverId || this.auth.currentUser()?.id || 0,
        disabled: !this.data.canChangeResolver || this.data.selfTake,
      },
      Validators.min(1),
    ],
    handoffUserId: [null as number | null],
  });

  readonly selectedResult = signal<ResolutionResult>(this.form.controls.result.value);
  readonly showHandoff = computed(
    () =>
      this.data.canHandoff && isIncompleteResolutionResult(this.selectedResult())
  );

  constructor() {
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TICKET' }).subscribe({
      error: () => undefined,
    });
    this.form.controls.result.valueChanges.subscribe((value) => {
      this.selectedResult.set(value);
      if (!isIncompleteResolutionResult(value)) {
        this.form.controls.handoffUserId.setValue(null);
      }
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const me = this.auth.currentUser();
    if (this.data.selfTake && !me?.id) {
      this.snack.open('ไม่พบผู้ใช้ปัจจุบัน — ลองเข้าสู่ระบบใหม่', 'ปิด', { duration: 4000 });
      return;
    }
    const resolvedByUserId = this.data.selfTake
      ? me!.id
      : this.data.canChangeResolver
        ? Number(raw.resolvedByUserId)
        : (me?.id ?? Number(raw.resolvedByUserId));
    const incomplete = isIncompleteResolutionResult(raw.result);
    const handoffUserId =
      incomplete && this.data.canHandoff && raw.handoffUserId != null
        ? Number(raw.handoffUserId)
        : null;

    this.saving.set(true);
    this.claimWarning = null;
    const prepare$ = this.data.selfTake ? this.takeTicketSelf(me!.id) : of(null);
    prepare$
      .pipe(
        switchMap(() =>
          this.ticketsApi.addResolution(this.data.ticketId, {
            rootCause: raw.rootCause.trim() || null,
            detail: raw.detail,
            hoursSpent:
              raw.hoursSpent == null || String(raw.hoursSpent).trim() === ''
                ? null
                : Number(raw.hoursSpent),
            result: raw.result,
            resolvedByUserId,
            resolvedAt: new Date().toISOString(),
          })
        ),
        switchMap(({ resolution, quota }) =>
          this.uploadFiles(resolution).pipe(map((upload) => ({ quota, upload })))
        ),
        switchMap(({ quota, upload }) => {
          if (incomplete) {
            this.demoOverlay.markIncompleteWork(
              this.data.ticketId,
              raw.result === 'FAILED' ? 'FAILED' : 'PARTIAL'
            );
          } else {
            this.demoOverlay.clearIncompleteWork(this.data.ticketId);
          }
          if (
            handoffUserId != null &&
            handoffUserId > 0 &&
            handoffUserId !== this.data.currentAssigneeId
          ) {
            return this.ticketsApi.assign(this.data.ticketId, handoffUserId).pipe(
              map(() => ({ quota, upload, handedOff: true as const })),
              catchError((err: Error) => {
                this.snack.open(
                  `บันทึกรอบแล้ว แต่ส่งต่อผู้รับผิดชอบไม่สำเร็จ: ${err.message}`,
                  'ปิด',
                  { duration: 6500 }
                );
                return of({ quota, upload, handedOff: false as const });
              })
            );
          }
          return of({ quota, upload, handedOff: false as const });
        })
      )
      .subscribe({
        next: ({ quota, upload, handedOff }) => {
          this.saving.set(false);
          let msg = incomplete
            ? raw.result === 'PARTIAL'
              ? 'บันทึกสำเร็จบางส่วนแล้ว — ใบยังเปิดอยู่ ทำต่อหรือส่งต่อได้'
              : 'บันทึกไม่สำเร็จแล้ว — ใบยังเปิดอยู่ ทำต่อหรือส่งต่อได้'
            : 'บันทึกรอบสำเร็จแล้ว';
          if (handedOff) {
            msg += ' · ส่งต่อผู้รับผิดชอบแล้ว';
          }
          if (upload.uploaded > 0) {
            msg += ` · แนบไว้กับรอบที่ ${upload.round} แล้ว ${upload.uploaded} ไฟล์`;
          }
          if (upload.failed.length) {
            msg += ` · อัปโหลดไม่สำเร็จ: ${upload.failed.join(', ')}`;
          }
          if (this.claimWarning) {
            msg += ` · ${this.claimWarning}`;
          }
          if (quota) {
            msg += ` · โควตา ${quota.periodStart}–${quota.periodEnd}: เหลือ ${quota.remaining}/${quota.quota}`;
            if (quota.isOverQuota) {
              msg += ' (เกินโควตา)';
            }
          }
          this.snack.open(msg, 'ปิด', {
            duration:
              quota?.isOverQuota ||
              incomplete ||
              upload.failed.length ||
              this.claimWarning
                ? 6000
                : 2800,
          });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 4500 });
        },
      });
  }

  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    const tooBig = picked.filter((f) => f.size > DOCUMENT_MAX_BYTES);
    if (tooBig.length) {
      this.snack.open(
        `ไฟล์ใหญ่เกิน 20 MB: ${tooBig.map((f) => f.name).join(', ')}`,
        'ปิด',
        { duration: 4500 }
      );
    }
    const ok = picked.filter((f) => f.size <= DOCUMENT_MAX_BYTES);
    if (ok.length) {
      this.files.update((list) => [...list, ...ok]);
    }
  }

  removeFile(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  fileSize(bytes: number): string {
    return formatDocumentFileSize(bytes);
  }

  /** รับคิว (ถ้ายังไม่มีแอดมินรับ) → มอบหมายให้ตัวเอง → เริ่มงาน */
  private takeTicketSelf(myId: number): Observable<unknown> {
    const claim$: Observable<unknown> =
      this.data.claimedByAdminUserId == null
        ? this.ticketsApi.claim(this.data.ticketId).pipe(
            catchError((err: unknown) => {
              this.claimWarning = `รับคิวไม่สำเร็จ (${apiErrorMessage(err)})`;
              return of(null);
            })
          )
        : of(null);
    return claim$.pipe(
      switchMap((): Observable<unknown> =>
        this.data.currentAssigneeId === myId
          ? of(null)
          : this.ticketsApi.assign(this.data.ticketId, myId).pipe(
              catchError((err: Error) =>
                throwError(() => new Error(`มอบหมายให้ตัวเองไม่สำเร็จ: ${err.message}`))
              )
            )
      ),
      switchMap(() => this.ticketsApi.get(this.data.ticketId)),
      switchMap((t: Ticket): Observable<unknown> =>
        t.status === 'ASSIGNED'
          ? this.ticketsApi.start(this.data.ticketId).pipe(
              catchError((err: Error) =>
                throwError(() => new Error(`เริ่มงานไม่สำเร็จ: ${err.message}`))
              )
            )
          : of(t)
      )
    );
  }

  /**
   * อัปโหลดทีละไฟล์เข้ารอบแก้ไขนี้ (refType TICKET_RESOLUTION) · ไฟล์ที่ไม่ผ่านไม่ทำให้รอบที่บันทึกแล้วล้ม
   */
  private uploadFiles(resolution: TicketResolution): Observable<UploadSummary> {
    const files = this.files();
    const empty: UploadSummary = { round: resolution.round, uploaded: 0, failed: [] };
    if (!files.length) {
      return of(empty);
    }
    const uploads = files.map((file) =>
      this.attachmentsApi
        .upload({ file, refType: 'TICKET_RESOLUTION', refId: resolution.id })
        .pipe(
          map((): string | null => null),
          catchError((err: unknown) => of(`${file.name} (${apiErrorMessage(err)})`))
        )
    );
    return concat(...uploads).pipe(
      toArray(),
      map((outcomes) =>
        outcomes.reduce<UploadSummary>((acc, failed) => {
          if (failed == null) {
            acc.uploaded++;
          } else {
            acc.failed.push(failed);
          }
          return acc;
        }, empty)
      )
    );
  }
}

interface UploadSummary {
  round: number;
  uploaded: number;
  /** ชื่อไฟล์ (เหตุผล) ที่อัปโหลดไม่ผ่าน */
  failed: string[];
}

/* ——— Assign / pickup dialog ——— */

export interface TicketAssignDialogUser {
  id: number;
  fullName: string;
  nickname?: string | null;
  position?: string | null;
  roleName?: string | null;
  avatarUrl?: string | null;
}

export interface TicketAssignDialogData {
  users: TicketAssignDialogUser[];
  defaultUserId: number | null;
  title: string;
  /** ผู้รับผิดชอบปัจจุบันของใบ — โชว์ป้าย「ดูแลอยู่」 */
  currentAssigneeId?: number | null;
  /** ผู้ใช้ที่ล็อกอิน — โชว์ป้าย「ฉัน」และเรียงขึ้นก่อน */
  meId?: number | null;
  /** จำนวนการ์ดต่อหน้า — ไม่ระบุ = ASSIGN_PAGE_SIZE */
  pageSize?: number;
}

/** แปลง User → แถวในกล่องเลือกผู้รับผิดชอบ (ใช้ฟิลด์ที่มีอยู่แล้วเท่านั้น) */
export function toAssignDialogUser(u: {
  id: number;
  fullName: string;
  nickname?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
  roles?: { name: string }[] | null;
}): TicketAssignDialogUser {
  return {
    id: u.id,
    fullName: u.fullName,
    nickname: u.nickname ?? null,
    position: u.position ?? null,
    roleName: u.roles?.[0]?.name ?? null,
    avatarUrl: u.avatarUrl ?? null,
  };
}

/** จำนวนการ์ดผู้รับผิดชอบต่อหน้า (ค่าเริ่มต้น) — ส่ง data.pageSize เพื่อกำหนดเฉพาะจุด */
export const ASSIGN_PAGE_SIZE = 6;
export const ASSIGN_PAGE_SIZE_OPTIONS = [6, 12, 24];
const ASSIGN_PAGE_SIZE_KEY = 'cpams.assignDialog.pageSize';

function readStoredPageSize(): number | null {
  try {
    const n = Number(localStorage.getItem(ASSIGN_PAGE_SIZE_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-ticket-assign-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TablePaginatorComponent, UserAvatarComponent],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="assign-lead">
        เลือก 1 คนที่จะรับผิดชอบใบนี้
        <span class="assign-count">
          @if (query().trim()) {
            พบ {{ visibleUsers().length }} จาก {{ users().length }} คน
          } @else {
            ทั้งหมด {{ users().length }} คน
          }
        </span>
      </p>
      <label class="assign-search">
        <mat-icon>search</mat-icon>
        <input
          type="search"
          placeholder="ค้นหาชื่อ / ชื่อเล่น / ตำแหน่ง"
          aria-label="ค้นหาผู้รับผิดชอบ"
          [value]="query()"
          (input)="onSearch($any($event.target).value)"
        />
      </label>
      <ul class="assign-list" role="radiogroup" aria-label="ผู้รับผิดชอบ">
        @for (u of pagedUsers(); track u.id) {
          <li>
            <button
              type="button"
              class="assign-item"
              role="radio"
              [attr.aria-checked]="selectedId() === u.id"
              [class.is-selected]="selectedId() === u.id"
              (click)="selectedId.set(u.id)"
              (dblclick)="selectedId.set(u.id); confirm()"
            >
              <app-user-avatar class="assign-avatar" [url]="u.avatarUrl" [name]="u.fullName" [size]="38" />
              <span class="assign-body">
                <span class="assign-name">
                  {{ u.fullName }}
                  @if (u.nickname) {
                    <small>({{ u.nickname }})</small>
                  }
                </span>
                @if (roleLine(u); as line) {
                  <span class="assign-meta">{{ line }}</span>
                } @else if (profilesLoading()) {
                  <span class="assign-meta">กำลังโหลดตำแหน่ง…</span>
                }
              </span>
              <span class="assign-tags">
                @if (u.id === data.meId) {
                  <span class="assign-tag assign-tag--me">ฉัน</span>
                }
                @if (u.id === data.currentAssigneeId) {
                  <span class="assign-tag">ดูแลอยู่</span>
                }
              </span>
              <mat-icon class="assign-check" aria-hidden="true">
                {{ selectedId() === u.id ? 'radio_button_checked' : 'radio_button_unchecked' }}
              </mat-icon>
            </button>
          </li>
        } @empty {
          <li class="assign-empty">ไม่พบรายชื่อที่ค้นหา</li>
        }
      </ul>
      @if (!isHandset()) {
      <app-table-paginator
        class="assign-pager"
        [length]="visibleUsers().length"
        [pageIndex]="currentPage()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="pageSizeOptions"
        (page)="onPage($event)"
      />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!selectedId()" (click)="confirm()">
        @if (selectedUser(); as su) {
          มอบให้ {{ su.nickname || su.fullName }}
        } @else {
          ยืนยัน
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host { display: block; }
    .assign-lead {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.25rem 0.75rem;
      margin: 0 0 0.6rem;
      color: var(--app-muted);
      font-size: 0.85rem;
    }
    .assign-count { font-size: 0.78rem; color: var(--app-subtle); }
    .assign-search {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.6rem;
      padding: 0 0.7rem;
      height: 40px;
      border: 1px solid var(--app-control-line);
      border-radius: 10px;
      background: var(--app-surface);
      mat-icon { color: var(--app-muted); width: 20px; height: 20px; font-size: 20px; }
      input {
        flex: 1 1 auto;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--app-ink);
        font: inherit;
        font-size: 16px;
      }
    }
    .assign-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
      gap: 0.5rem;
      margin: 0;
      padding: 0.15rem;
      list-style: none;
    }
    .assign-pager { margin-top: 0.35rem; }
    .assign-item {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      padding: 0.6rem 0.7rem;
      border: 1px solid var(--app-line);
      border-radius: 12px;
      background: var(--app-surface);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.12s ease, background 0.12s ease;
      &:hover { border-color: var(--app-accent-line); }
      &:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 1px; }
      &.is-selected {
        border-color: var(--app-accent);
        background: var(--app-accent-soft);
        box-shadow: 0 0 0 1px var(--app-accent);
      }
    }
    .assign-item.is-selected .assign-avatar {
      box-shadow: 0 0 0 2px var(--app-surface), 0 0 0 4px var(--app-accent);
    }
    .assign-body { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
    .assign-name {
      color: var(--app-ink);
      font-size: 0.9rem;
      font-weight: 650;
      line-height: 1.3;
      overflow-wrap: anywhere;
      small { color: var(--app-muted); font-weight: 500; }
    }
    .assign-meta {
      color: var(--app-muted);
      font-size: 0.76rem;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .assign-tags { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; flex: 0 0 auto; }
    .assign-tag {
      padding: 0.05rem 0.45rem;
      border-radius: 999px;
      background: var(--app-info-soft);
      color: var(--app-info);
      font-size: 0.68rem;
      font-weight: 700;
      white-space: nowrap;
      &--me { background: var(--app-surface-3); color: var(--app-text-soft); }
    }
    .assign-check { flex: 0 0 auto; color: var(--app-control-line); }
    .assign-item.is-selected .assign-check { color: var(--app-accent); }
    .assign-empty { padding: 1rem; color: var(--app-muted); font-size: 0.85rem; text-align: center; }
    @media (max-width: 640px) {
      .assign-list { grid-template-columns: 1fr; }
    }
  `,
})
export class TicketAssignDialogComponent {
  private readonly ref = inject(MatDialogRef<TicketAssignDialogComponent, number | null>);
  private readonly usersApi = inject(UserService);
  readonly data = inject<TicketAssignDialogData>(MAT_DIALOG_DATA);
  readonly pageSize = signal(
    Math.max(1, Math.floor(readStoredPageSize() ?? this.data.pageSize ?? ASSIGN_PAGE_SIZE))
  );
  readonly pageSizeOptions = [...new Set([...ASSIGN_PAGE_SIZE_OPTIONS, this.pageSize()])].sort(
    (a, b) => a - b
  );
  readonly page = signal(0);

  readonly users = signal<TicketAssignDialogUser[]>(this.data.users);
  readonly profilesLoading = signal(false);
  readonly selectedId = signal<number | null>(
    this.data.users.some((u) => u.id === this.data.defaultUserId) ? this.data.defaultUserId : null
  );
  readonly query = signal('');

  private readonly sortedUsers = computed(() => {
    const rank = (u: TicketAssignDialogUser) =>
      u.id === this.data.currentAssigneeId ? 0 : u.id === this.data.meId ? 1 : 2;
    return [...this.users()].sort(
      (a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, 'th')
    );
  });

  readonly visibleUsers = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.sortedUsers();
    if (!q) {
      return all;
    }
    return all.filter((u) =>
      [u.fullName, u.nickname, u.position, u.roleName].some((v) => v?.toLowerCase().includes(q))
    );
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.visibleUsers().length / this.pageSize()))
  );
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 640px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false }
  );

  readonly pagedUsers = computed(() => {
    if (this.isHandset()) {
      return this.visibleUsers();
    }
    const size = this.pageSize();
    const page = this.currentPage();
    return this.visibleUsers().slice(page * size, (page + 1) * size);
  });

  onPage(event: PageEvent): void {
    if (event.pageSize !== this.pageSize()) {
      this.setPageSize(event.pageSize);
      return;
    }
    this.page.set(event.pageIndex);
  }

  setPageSize(n: number): void {
    if (!Number.isInteger(n) || n < 1) {
      return;
    }
    this.pageSize.set(n);
    this.page.set(0);
    try {
      localStorage.setItem(ASSIGN_PAGE_SIZE_KEY, String(n));
    } catch {
      /* โหมดส่วนตัว / storage เต็ม — ใช้ค่าในหน้าต่างนี้ต่อได้ */
    }
  }

  readonly selectedUser = computed(
    () => this.users().find((u) => u.id === this.selectedId()) ?? null
  );

  onSearch(value: string): void {
    this.query.set(value);
    this.page.set(0);
  }

  constructor() {
    const missing = this.data.users.some((u) => !u.position && !u.roleName && !u.avatarUrl);
    if (!missing) {
      return;
    }
    this.profilesLoading.set(true);
    this.usersApi.loadProfilesQuietly().subscribe((profiles) => {
      this.profilesLoading.set(false);
      if (!profiles.length) {
        return;
      }
      const byId = new Map(profiles.map((p) => [p.id, toAssignDialogUser(p)]));
      this.users.update((list) =>
        list.map((u) => {
          const p = byId.get(u.id);
          return p
            ? {
                ...u,
                nickname: u.nickname || p.nickname,
                position: u.position || p.position,
                roleName: u.roleName || p.roleName,
                avatarUrl: u.avatarUrl || p.avatarUrl,
              }
            : u;
        })
      );
    });
  }

  roleLine(u: TicketAssignDialogUser): string {
    const parts = [u.position, u.roleName].filter((v): v is string => !!v?.trim());
    return parts.filter((v, i) => parts.indexOf(v) === i).join(' · ');
  }

  confirm(): void {
    const id = this.selectedId();
    if (!id) {
      return;
    }
    this.ref.close(id);
  }
}

/* ——— ปัญหาเดิมกลับมา: reopen + assign ในครั้งเดียว ——— */

export interface TicketProblemReturnedDialogData {
  ticketId: number;
  ticket: Ticket;
  /** closedAt ณ ตอนเปิดกล่อง (ก่อนเรียก reopen) */
  closedAtSnapshot: string | null;
  lastResolution: TicketResolution | null;
  users: { id: number; fullName: string }[];
  canAssign: boolean;
  defaultAssigneeId: number | null;
}

@Component({
  selector: 'app-ticket-problem-returned-dialog',
  standalone: true,
  imports: [
    UserOptionComponent,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>ปัญหาเดิมกลับมา</h2>
    <mat-dialog-content>
      <p class="intro">เปิดรอบใหม่ในใบเดิม — ไม่สร้างใบใหม่ · ให้คนตัดสินว่าเป็นปัญหาเดิมจริง</p>

      @if (data.lastResolution; as last) {
        <section class="last-round">
          <header class="last-round__head">
            <strong>รอบล่าสุด · งานครั้งที่ {{ last.round }}</strong>
            @if (closedAgo(); as ago) {
              <span class="ago-chip" [class.ago-chip--warn]="ago.old">{{ ago.label }}</span>
            }
          </header>
          <dl>
            <dt>สาเหตุ</dt>
            <dd>
              <div class="clip" [class.clip--open]="causeOpen()">{{ last.rootCause?.trim() || '—' }}</div>
              @if (isLong(last.rootCause)) {
                <button type="button" class="more" (click)="causeOpen.set(!causeOpen())">
                  {{ causeOpen() ? 'ย่อ' : 'ดูเพิ่มเติม' }}
                </button>
              }
            </dd>
            <dt>วิธีแก้</dt>
            <dd>
              <div class="clip" [class.clip--open]="detailOpen()">{{ last.detail.trim() || '—' }}</div>
              @if (isLong(last.detail)) {
                <button type="button" class="more" (click)="detailOpen.set(!detailOpen())">
                  {{ detailOpen() ? 'ย่อ' : 'ดูเพิ่มเติม' }}
                </button>
              }
            </dd>
          </dl>
          <p class="tip">
            <mat-icon>lightbulb</mat-icon>
            ดูวิธีแก้รอบก่อน เพื่อไม่แก้ด้วยวิธีเดิมซ้ำ
          </p>
        </section>
        @if (closedAgo()?.old) {
          <p class="ago-warn">ปิดไปนานแล้ว — ยืนยันว่าเป็นอาการเดิมจริงก่อนเปิดรอบใหม่</p>
        }
      } @else {
        <p class="muted">ยังไม่มีประวัติรอบแก้ไขในใบนี้</p>
        @if (closedAgo(); as ago) {
          <p class="muted" [class.ago-warn]="ago.old">{{ ago.label }}</p>
        }
      }

      <form [formGroup]="form" id="ticket-reopen-form" class="dlg-form" (ngSubmit)="confirm()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>อาการที่กลับมา</mat-label>
          <textarea
            matInput
            rows="3"
            formControlName="symptom"
            placeholder="อธิบายอาการที่กลับมาอีกครั้ง"
          ></textarea>
        </mat-form-field>
        @if (data.canAssign) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>ผู้รับผิดชอบรอบนี้</mat-label>
            <mat-select formControlName="assignedUserId">
              @for (u of data.users; track u.id) {
                <mat-option [value]="u.id"><app-user-option [userId]="u.id" [name]="u.fullName" /></mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <p class="muted">
            ไม่มีสิทธิ์มอบหมาย — หลังเปิดจะเป็น「รอรับงานรอบใหม่」รอคนที่มีสิทธิ์กดรับงาน
          </p>
        }
      </form>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="ticket-reopen-form"
        [disabled]="saving()"
      >
        {{ saving() ? 'กำลังเปิด…' : 'เปิดรอบใหม่' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro {
      margin: 0 0 0.75rem;
      color: var(--app-muted);
      font-size: 0.86rem;
    }
    .last-round {
      margin: 0 0 0.85rem;
      padding: 0.8rem 0.95rem;
      border-radius: 12px;
      background: var(--app-surface-2);
      border: 1px solid var(--app-line);
      font-size: 0.88rem;
    }
    .last-round__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.6rem;
      color: var(--app-ink);
    }
    .ago-chip {
      padding: 0.12rem 0.6rem;
      border-radius: 999px;
      background: var(--app-accent-soft);
      color: var(--app-accent);
      font-size: 0.76rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .ago-chip--warn {
      background: var(--app-warn-soft);
      color: var(--app-warn-ink);
    }
    .last-round dl {
      display: grid;
      grid-template-columns: 4.5rem 1fr;
      gap: 0.5rem 0.75rem;
      margin: 0;
    }
    .last-round dt {
      color: var(--app-muted);
    }
    .last-round dd {
      margin: 0;
      min-width: 0;
      color: var(--app-ink);
    }
    .clip {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.5;
    }
    .clip--open {
      display: block;
      -webkit-line-clamp: unset;
      max-height: 12rem;
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .more {
      margin: 0.15rem 0 0;
      padding: 0;
      border: 0;
      background: none;
      color: var(--app-accent);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }
    .more:hover {
      text-decoration: underline;
    }
    .tip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0.7rem 0 0;
      padding-top: 0.6rem;
      border-top: 1px dashed var(--app-line);
      color: var(--app-accent);
      font-size: 0.8rem;
    }
    .tip mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .ago-warn {
      margin: 0 0 0.75rem;
      color: var(--app-warn-ink);
      font-size: 0.85rem;
      font-weight: 500;
    }
    .muted {
      color: var(--app-muted);
      font-size: 0.86rem;
      margin: 0 0 0.75rem;
      line-height: 1.4;
    }
    .dlg-form {
      display: grid;
      gap: 0.5rem;
      padding-top: 0.5rem;
      min-width: min(720px, 92vw);
    }
    .full {
      width: 100%;
    }
    .error {
      color: var(--app-danger-ink);
      font-size: 0.86rem;
      margin: 0.35rem 0 0;
    }
  `,
})
export class TicketProblemReturnedDialogComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketProblemReturnedDialogComponent, boolean>);
  readonly data = inject<TicketProblemReturnedDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly causeOpen = signal(false);
  readonly detailOpen = signal(false);

  readonly form = this.fb.group({
    symptom: [''],
    assignedUserId: [
      this.data.canAssign
        ? (this.data.defaultAssigneeId ?? this.data.users[0]?.id ?? null)
        : null,
      this.data.canAssign ? [Validators.required, Validators.min(1)] : [],
    ],
  });

  /** ยาวเกิน 2 บรรทัดโดยประมาณ — แสดงปุ่มดูเพิ่มเติม */
  isLong(text: string | null | undefined): boolean {
    const t = text?.trim() ?? '';
    return t.length > 110 || t.split('\n').length > 2;
  }

  closedAgo(): { label: string; old: boolean } | null {
    const closedAt = this.data.closedAtSnapshot;
    if (closedAt) {
      const days = Math.max(
        0,
        Math.floor((Date.now() - new Date(closedAt).getTime()) / 86_400_000)
      );
      const old = days > 90;
      if (days < 1) {
        return { label: 'ปิดงานไปเมื่อวันนี้', old: false };
      }
      if (days < 30) {
        return { label: `ปิดงานไปเมื่อ ${days} วันก่อน`, old };
      }
      const months = Math.floor(days / 30);
      if (months < 12) {
        return { label: `ปิดงานไปเมื่อ ${months} เดือนก่อน`, old };
      }
      return { label: `ปิดงานไปเมื่อ ${Math.floor(months / 12)} ปีก่อน`, old };
    }
    const resolvedAt = this.data.ticket.resolvedAt;
    if (!resolvedAt) {
      return null;
    }
    const days = Math.max(
      0,
      Math.floor((Date.now() - new Date(resolvedAt).getTime()) / 86_400_000)
    );
    if (days < 1) {
      return { label: 'แก้ไขแล้วเมื่อวันนี้', old: false };
    }
    if (days < 30) {
      return { label: `แก้ไขแล้วเมื่อ ${days} วันก่อน`, old: days > 90 };
    }
    const months = Math.floor(days / 30);
    return {
      label: `แก้ไขแล้วเมื่อ ${months < 12 ? months + ' เดือน' : Math.floor(months / 12) + ' ปี'}ก่อน`,
      old: days > 90,
    };
  }

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const reason = (raw.symptom ?? '').trim() || null;
    const assigneeId = raw.assignedUserId ? Number(raw.assignedUserId) : null;

    this.saving.set(true);
    this.error.set(null);

    this.ticketsApi
      .reopen(this.data.ticketId, reason, this.auth.currentUser()?.id ?? null)
      .pipe(
        switchMap((reopened) => {
          if (!this.data.canAssign || !assigneeId) {
            return of({ assigned: false as const });
          }
          const id = this.data.ticketId;
          const assign$ = reopened.claimedByAdminUserId
            ? this.ticketsApi.assign(id, assigneeId)
            : this.ticketsApi.sendToAdmin(id).pipe(
                switchMap(() => this.ticketsApi.claim(id)),
                switchMap(() => this.ticketsApi.assign(id, assigneeId))
              );
          return assign$.pipe(
            switchMap(() => of({ assigned: true as const })),
            catchError((err: Error) => {
              this.saving.set(false);
              const msg = `เปิดใบกลับมาแล้ว แต่ยังมอบหมายผู้รับผิดชอบไม่สำเร็จ: ${err.message}`;
              this.error.set(msg);
              this.snack.open(msg, 'ปิด', { duration: 6500 });
              // ปิดกล่องแล้วรีเฟรช — ปุ่มรับงานรอบใหม่ต้องยังกดได้
              this.ref.close(true);
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          if (result.assigned) {
            this.snack.open(
              'เปิดรอบใหม่แล้ว — สถานะ「รอเริ่มงาน」',
              'ปิด',
              { duration: 3500 }
            );
          } else {
            this.snack.open(
              'เปิดเป็น「รอรับงานรอบใหม่」แล้ว — ให้ผู้มีสิทธิ์มอบหมายกดรับงาน',
              'ปิด',
              { duration: 4500 }
            );
          }
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}

/* ——— รายละเอียดงานแก้ไข 1 ครั้ง + พิมพ์ใบยืนยัน (B-11/B-12) ——— */

export interface TicketWorkRoundDetailDialogData {
  ticket: Ticket;
  resolution: TicketResolution;
  customerName: string;
  projectName: string;
  resolverName: string;
  ticketNo: string;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** จัดหน้าใบยืนยันจาก GET confirmation-print — ช่องเซ็นว่าง (ห้าม e-sign) */
export function printTicketConfirmationFromPayload(
  payload: TicketConfirmationPrintPayload
): void {
  const win = window.open('', '_blank');
  if (!win) {
    return;
  }
  const r = payload.resolution;
  const resultLabel =
    RESOLUTION_RESULT_LABELS[r.result as ResolutionResult] ?? r.result;
  const resolver =
    r.resolvedBy?.fullName?.trim() ||
    (r.resolvedByUserId != null ? `#${r.resolvedByUserId}` : '—');
  const hours =
    r.hoursSpent != null ? `${r.hoursSpent} ชั่วโมง` : '—';
  const projectLabel = payload.project
    ? [payload.project.code, payload.project.name].filter(Boolean).join(' · ')
    : '—';
  const contact = payload.reportedByContact;
  const ticketNo = payload.ticket.ticketNo?.trim() || `ใบ #${payload.ticket.id}`;
  const resolvedAt = formatThaiDateTime(r.resolvedAt) || r.resolvedAt || '—';
  const logoUrl =
    typeof location !== 'undefined' ? `${location.origin}/logo.png` : 'logo.png';
  const signBlocks = (payload.signatureBlocks?.length
    ? payload.signatureBlocks
    : [
        { role: 'PROVIDER', label: 'ผู้ให้บริการ / ผู้แก้ไข' },
        { role: 'CUSTOMER', label: 'ลูกค้า / ผู้รับมอบงาน' },
      ]
  )
    .map(
      (b) =>
        `<div><div class="sign-space"></div><div class="sign-line">${escapeHtml(b.label)}</div><p>วันที่ ............................</p></div>`
    )
    .join('');

  win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<title>${escapeHtml(payload.documentTitle)} · ${escapeHtml(ticketNo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#e7eeeb;color:#1c2b28;font-family:Sarabun,"Segoe UI",sans-serif}
.sheet{position:relative;max-width:820px;margin:0 auto 2.5rem;background:#fff;padding:1.75rem 2rem 1.5rem;box-shadow:0 10px 28px rgba(28,43,40,.08)}
.content{position:relative}
.head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-bottom:.9rem;border-bottom:3px solid #0f766e}
.brand{display:flex;align-items:center;gap:.7rem;min-width:0}
.brand img{width:46px;height:46px;object-fit:contain}
.brand strong{display:block;font-size:1.05rem}
.brand span{display:block;color:#5b6762;font-size:.82rem}
.docno{text-align:right}
.docno span{display:block;color:#5b6762;font-size:.72rem}
.docno strong{display:block;color:#0f766e;font-size:1.15rem}
.party{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin:1rem 0 .85rem}
.box{border:1px solid #d7e0dc;border-radius:10px;padding:.8rem .95rem;background:#f7fbf9}
.box h3{margin:0 0 .45rem;color:#0f766e;font-size:.75rem;letter-spacing:.04em}
.who{margin:0 0 .35rem;font-size:1.05rem;font-weight:700}
.role{margin:0;color:#5b6762;font-size:.85rem}
.kv{display:grid;grid-template-columns:6.4rem 1fr;gap:.18rem .45rem;margin:0;font-size:.88rem}
.kv dt{color:#5b6762}
.kv dd{margin:0}
.cover{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:0 0 .9rem;padding:.8rem 1rem;border-radius:10px;background:#ecfdf5;border:1px solid #b7e4d8}
.cover span{display:block;color:#5b6762;font-size:.75rem}
.cover strong{font-size:1.02rem}
.cover em{display:block;margin-top:.15rem;font-style:normal;color:#5b6762;font-size:.78rem}
.len{flex:0 0 auto;text-align:right;font-weight:700;color:#0f766e;font-size:.95rem}
.terms{width:100%;border-collapse:collapse}
.terms th,.terms td{padding:.5rem .1rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top;font-size:.9rem}
.terms th{width:28%;color:#5b6762;font-weight:600}
.terms td{white-space:pre-wrap}
.scope{margin:.85rem 0 0;padding:.75rem .9rem;border-radius:10px;background:#f7fbf9;border:1px solid #e4ebe8}
.scope h3{margin:0 0 .3rem;font-size:.75rem;color:#0f766e;letter-spacing:.04em}
.scope p{margin:0;white-space:pre-wrap;font-size:.9rem}
.note{margin:.7rem 0 0;color:#5b6762;font-size:.8rem}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2.25rem;margin-top:2.1rem}
.sign-space{height:2.8rem}
.sign-line{border-top:1px solid #1c2b28;padding-top:.4rem;text-align:center;font-weight:600;font-size:.88rem}
.sign p{margin:.3rem 0 0;text-align:center;color:#5b6762;font-size:.8rem}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:1.4rem;padding-top:.55rem;border-top:1px solid #e4ebe8;color:#5b6762;font-size:.72rem}
.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;padding:.7rem 1rem;background:#e7eeeb}
.print-btn{border:0;border-radius:999px;padding:.6rem 1.25rem;background:#0f766e;color:#fff;font:600 .95rem Sarabun,sans-serif;cursor:pointer}
@page{size:A4;margin:12mm}
@media print{
  body{background:#fff}
  .toolbar{display:none}
  .sheet{max-width:none;margin:0;padding:0;box-shadow:none}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
<div class="toolbar"><button class="print-btn" type="button" onclick="window.print()">พิมพ์</button></div>
<div class="sheet"><div class="content">
<header class="head">
  <div class="brand">
    <img src="${escapeHtml(logoUrl)}" alt="Code Chill">
    <div>
      <strong>Code Chill</strong>
      <span>${escapeHtml(payload.documentTitle)}</span>
    </div>
  </div>
  <div class="docno">
    <span>เลขที่ใบปัญหา</span>
    <strong>${escapeHtml(ticketNo)}</strong>
  </div>
</header>

<div class="party">
  <section class="box">
    <h3>ผู้ให้บริการ</h3>
    <p class="who">Code Chill</p>
    <p class="role">ผู้แก้ไข: ${escapeHtml(resolver)}</p>
  </section>
  <section class="box">
    <h3>ลูกค้า</h3>
    <p class="who">${escapeHtml(payload.customer.name)}</p>
    <dl class="kv">
      ${payload.customer.code ? `<dt>รหัส</dt><dd>${escapeHtml(payload.customer.code)}</dd>` : ''}
      ${payload.customer.address ? `<dt>ที่อยู่</dt><dd>${escapeHtml(payload.customer.address)}</dd>` : ''}
      <dt>โทร</dt><dd>${escapeHtml(payload.customer.phone || '—')}</dd>
      ${
        contact
          ? `<dt>ผู้แจ้ง</dt><dd>${escapeHtml(contact.name)}${contact.phone ? ' · ' + escapeHtml(contact.phone) : ''}</dd>`
          : ''
      }
    </dl>
  </section>
</div>

<div class="cover">
  <div>
    <span>งานครั้งที่ ${r.round}</span>
    <strong>${escapeHtml(payload.ticket.title)}</strong>
    <em>แก้เสร็จเมื่อ ${escapeHtml(resolvedAt)}</em>
  </div>
  <div class="len">${escapeHtml(resultLabel)}</div>
</div>

<table class="terms">
<tbody>
<tr><th>โปรเจกต์</th><td>${escapeHtml(projectLabel)}</td></tr>
<tr><th>สาเหตุ</th><td>${escapeHtml(r.rootCause?.trim() || '—')}</td></tr>
<tr><th>วิธีแก้ไข</th><td>${escapeHtml(r.detail || '—')}</td></tr>
<tr><th>เวลาที่ใช้</th><td>${escapeHtml(hours)}</td></tr>
</tbody>
</table>

<section class="scope">
  <h3>คำยืนยัน</h3>
  <p>ข้าพเจ้าได้ตรวจสอบผลการแก้ไขแล้ว และยืนยันว่าปัญหาได้รับการแก้ไขตามรายละเอียดข้างต้น</p>
</section>
<p class="note">ช่องลงชื่อเว้นว่างสำหรับเซ็นบนกระดาษ</p>

<div class="sign">${signBlocks}</div>

<footer class="foot">
  <span>${escapeHtml(ticketNo)} · งานครั้งที่ ${r.round}</span>
  <span>Code Chill · ${escapeHtml(payload.documentTitle)}</span>
</footer>
</div></div>
</body></html>`);
  win.document.close();
}

@Component({
  selector: 'app-ticket-work-round-detail-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EntityAttachmentsComponent,
    ThaiDatePipe,
  ],
  template: `
    <h2 mat-dialog-title>งานครั้งที่ {{ data.resolution.round }}</h2>
    <mat-dialog-content>
      <p class="ticket-ref">{{ data.ticketNo }} · {{ data.ticket.title }}</p>

      @if (data.resolution.steps.length) {
        <ol class="round-steps" aria-label="ลำดับงานครั้งนี้">
          @for (step of data.resolution.steps; track step.code + (step.at || '')) {
            <li
              [class.is-done]="!!step.at"
              [class.is-failed]="step.result === 'FAILED'"
              [class.is-partial]="step.result === 'PARTIAL'"
            >
              <div class="round-steps__main">
                <strong>{{ step.label }}</strong>
                @if (step.result) {
                  <span class="round-steps__result">
                    {{ stepResultLabel(step.result) }}
                  </span>
                }
              </div>
              @if (step.at) {
                <time class="round-steps__at">{{ step.at | thaiDate }}</time>
              } @else {
                <span class="round-steps__at muted">ยังไม่ถึงขั้นนี้</span>
              }
            </li>
          }
        </ol>
      }

      <dl class="detail-grid">
        <div>
          <dt>ผลลัพธ์</dt>
          <dd>{{ resultLabels[data.resolution.result] }}</dd>
        </div>
        <div>
          <dt>ผู้แก้ไข</dt>
          <dd>{{ data.resolverName }}</dd>
        </div>
        <div>
          <dt>เวลาที่ใช้</dt>
          <dd>
            {{
              data.resolution.hoursSpent != null
                ? data.resolution.hoursSpent + ' ชม.'
                : 'ยังไม่กรอก'
            }}
          </dd>
        </div>
        <div>
          <dt>แก้เสร็จเมื่อ</dt>
          <dd>{{ data.resolution.resolvedAt | thaiDate }}</dd>
        </div>
        <div class="full">
          <dt>สาเหตุ</dt>
          <dd>{{ data.resolution.rootCause?.trim() || '—' }}</dd>
        </div>
        <div class="full">
          <dt>วิธีแก้ไข</dt>
          <dd>{{ data.resolution.detail || '—' }}</dd>
        </div>
      </dl>

      <app-entity-attachments
        [refType]="attachRefType()"
        [refId]="attachRefId()"
        [heading]="attachHeading"
        [subtitle]="attachSubtitle()"
        [defaultNote]="attachDefaultNote()"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
      <button
        mat-stroked-button
        type="button"
        [disabled]="printing()"
        (click)="print()"
      >
        @if (printing()) {
          <mat-spinner diameter="18" />
        } @else {
          <mat-icon>print</mat-icon>
        }
        พิมพ์ใบยืนยัน
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .ticket-ref {
      margin: 0 0 0.85rem;
      color: var(--app-muted);
      font-size: 0.86rem;
    }
    .round-steps {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0.65rem 0.85rem;
      border-radius: 10px;
      background: var(--app-accent-soft);
      border: 1px solid var(--app-accent-soft);
      display: grid;
      gap: 0.45rem;
      font-size: 0.86rem;
      color: var(--app-accent);
      counter-reset: step;
    }
    .round-steps li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.35rem 0.75rem;
      align-items: baseline;
      padding-left: 1.35rem;
      position: relative;
      opacity: 0.55;
    }
    .round-steps li::before {
      counter-increment: step;
      content: counter(step);
      position: absolute;
      left: 0;
      top: 0.05rem;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 999px;
      background: var(--app-accent-line);
      color: var(--app-accent-dark);
      font-size: 0.68rem;
      font-weight: 700;
      display: grid;
      place-items: center;
    }
    .round-steps li.is-done {
      opacity: 1;
    }
    .round-steps li.is-failed {
      color: var(--app-danger);
    }
    .round-steps li.is-partial {
      color: var(--app-warn);
    }
    .round-steps__main {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.65rem;
      align-items: baseline;
    }
    .round-steps__result {
      font-size: 0.78rem;
      color: var(--app-text-soft);
    }
    .round-steps__at {
      font-size: 0.78rem;
      color: var(--app-muted);
    }
    .round-steps__at.muted {
      font-style: italic;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 0.85rem;
      margin: 0 0 1rem;
    }
    .detail-grid .full {
      grid-column: 1 / -1;
    }
    .detail-grid dt {
      margin: 0;
      font-size: 0.75rem;
      color: var(--app-muted);
    }
    .detail-grid dd {
      margin: 0.15rem 0 0;
      white-space: pre-wrap;
      line-height: 1.45;
      color: var(--app-ink);
    }
    mat-dialog-actions mat-icon,
    mat-dialog-actions mat-spinner {
      margin-right: 0.25rem;
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
      vertical-align: middle;
    }
    @media (max-width: 560px) {
      .detail-grid {
        grid-template-columns: 1fr;
      }
      .round-steps li {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class TicketWorkRoundDetailDialogComponent {
  private readonly ticketsApi = inject(TicketService);
  private readonly snack = inject(MatSnackBar);

  readonly data = inject<TicketWorkRoundDetailDialogData>(MAT_DIALOG_DATA);
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly printing = signal(false);

  readonly attachHeading = 'สแกนใบยืนยัน / ไฟล์แนบรอบแก้ไข';
  readonly attachRefType = signal<'TICKET_RESOLUTION'>('TICKET_RESOLUTION');
  readonly attachRefId = signal(this.data.resolution.id);
  readonly attachSubtitle = signal(
    this.data.resolution.attachments.length
      ? `${this.data.resolution.attachments.length} ไฟล์จากรายละเอียดใบ`
      : `อัปโหลดสแกนใบที่ลูกค้าเซ็นแล้ว · รอบที่ ${this.data.resolution.round}`
  );
  readonly attachDefaultNote = signal(
    `สแกนใบยืนยันรอบที่ ${this.data.resolution.round} ที่ลูกค้าเซ็นแล้ว`
  );

  stepResultLabel(result: string): string {
    return (
      this.resultLabels[result as ResolutionResult] ?? result
    );
  }

  print(): void {
    if (this.printing()) {
      return;
    }
    this.printing.set(true);
    this.ticketsApi
      .getConfirmationPrint(this.data.ticket.id, this.data.resolution.round)
      .subscribe({
        next: (payload) => {
          this.printing.set(false);
          const hint = payload.attachScanHint;
          if (hint?.refType === 'TICKET_RESOLUTION' && hint.refId) {
            this.attachRefType.set('TICKET_RESOLUTION');
            this.attachRefId.set(hint.refId);
          }
          if (hint?.noteSuggestion?.trim()) {
            const note = hint.noteSuggestion.trim();
            this.attachDefaultNote.set(note);
            this.attachSubtitle.set(note);
          }
          printTicketConfirmationFromPayload(payload);
        },
        error: (err: Error) => {
          this.printing.set(false);
          this.snack.open(err.message || 'โหลดใบยืนยันไม่สำเร็จ', 'ปิด', {
            duration: 4000,
          });
        },
      });
  }
}

