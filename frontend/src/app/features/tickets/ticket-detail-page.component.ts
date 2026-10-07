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
import { StatusBarComponent } from '../../shared/components/status-bar.component';
import {
  TicketReturnSupportDialogComponent,
  TicketReturnSupportDialogData,
  TicketReviewDialogResult,
} from './ticket-return-support-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
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
        title: 'ปัญหาเดิมกลับมาแล้ว — รอหัวหน้ามอบหมาย',
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
    if (id === 'reopen') {
      this.openProblemReturned();
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
        'ใบปิดงานแล้ว — กด「ปัญหาเดิมกลับมา」ก่อนจึงจะบันทึกรอบแก้ไขได้',
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
          ? 'แก้ไขเรียบร้อยแล้ว — รอแอดมินตรวจและส่งให้ซัพพอร์ต ถ้าปัญหากลับมาหลังปิดใบ ให้กด「ปัญหาเดิมกลับมา」'
          : 'รอซัพพอร์ตแจ้งลูกค้า — ระบบจะปิดใบให้เอง ถ้าปัญหากลับมาหลังปิดใบ ให้กด「ปัญหาเดิมกลับมา」',
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

  reopen(): void {
    this.openProblemReturned();
  }

  /** CLOSED เท่านั้น → reopen (+ assign ถ้ามีสิทธิ์) — อย่าโชว์ตอนยังแค่แก้ไขเรียบร้อย */
  openProblemReturned(): void {
    if (!this.canReopen()) {
      this.snack.open('ไม่มีสิทธิ์เปิดปัญหาเดิมกลับมา (ticket.reopen)', 'ปิด', {
        duration: 3500,
      });
      return;
    }
    const ticket = this.ticket();
    if (!ticket || ticket.status !== 'CLOSED') {
      this.snack.open(
        'กด「ปัญหาเดิมกลับมา」ได้หลังปิดใบแล้วเท่านั้น — ใบจะปิดเองเมื่อซัพพอร์ตกด「บอกลูกค้าแล้ว」',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    const last = [...this.resolutions()].sort((a, b) => b.round - a.round)[0] ?? null;
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TICKET' }).subscribe({
      next: (users) => {
        const ref = this.dialog.open(TicketProblemReturnedDialogComponent, {
          ...FORM_DIALOG,
          data: {
            ticketId: this.ticketId,
            ticket,
            closedAtSnapshot: ticket.closedAt,
            lastResolution: last,
            users: users.map((u) => ({ id: u.id, fullName: u.fullName })),
            canAssign: this.canAssign(),
            defaultAssigneeId: ticket.assignedUserId,
          } satisfies TicketProblemReturnedDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
          if (ok) {
            this.loadTicket();
          }
        });
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
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
    this.pickAssigneeAndAssign('รับงานรอบใหม่แล้ว — สถานะ「ส่งงานแล้ว」รอเริ่มดำเนินการ', {
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
            users: users.map((u) => ({ id: u.id, fullName: u.fullName })),
            defaultUserId: defaultId,
            title: opts?.preferCurrent ? 'รับงานรอบใหม่' : 'เลือกผู้รับผิดชอบ',
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
            <input matInput type="number" step="0.5" formControlName="hoursSpent" />
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
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (showHandoff()) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>ส่งต่องานให้ (ไม่บังคับ)</mat-label>
            <mat-select formControlName="handoffUserId">
              <mat-option [value]="null">— ไม่เปลี่ยนผู้รับผิดชอบ —</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
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
      color: #0f766e;
      font-size: 0.82rem;
    }
    .dlg-form {
      display: grid;
      gap: 0.35rem;
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
      border: 1px dashed #cbd5e1;
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
      color: #64748b;
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
      color: #64748b;
    }
    .files__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .files__size {
      color: #64748b;
      font-size: 0.8rem;
    }
    .files__empty {
      margin: 0.4rem 0 0;
      font-size: 0.8rem;
      color: #94a3b8;
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
    hoursSpent: [1, Validators.min(0)],
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
            hoursSpent: Number(raw.hoursSpent) || 0,
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

export interface TicketAssignDialogData {
  users: { id: number; fullName: string }[];
  defaultUserId: number | null;
  title: string;
}

@Component({
  selector: 'app-ticket-assign-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="ticket-assign-form" (ngSubmit)="confirm()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้รับผิดชอบ</mat-label>
          <mat-select formControlName="assignedUserId">
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="ticket-assign-form">ยืนยัน</button>
    </mat-dialog-actions>
  `,
  styles: `
    .full {
      width: 100%;
      margin-top: 0.35rem;
    }
  `,
})
export class TicketAssignDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<TicketAssignDialogComponent, number | null>);
  readonly data = inject<TicketAssignDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    assignedUserId: [this.data.defaultUserId ?? 0, Validators.min(1)],
  });

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(Number(this.form.getRawValue().assignedUserId));
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
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>ปัญหาเดิมกลับมา</h2>
    <mat-dialog-content>
      <p class="intro">เปิดรอบใหม่ในใบเดิม — ไม่สร้างใบใหม่ · ให้คนตัดสินว่าเป็นปัญหาเดิมจริง</p>

      @if (data.lastResolution; as last) {
        <div class="last-round">
          <strong>รอบล่าสุด (รอบที่ {{ last.round }})</strong>
          <p>สาเหตุ「{{ last.rootCause?.trim() || '—' }}」</p>
          <p>วิธีแก้「{{ last.detail.trim() || '—' }}」</p>
          <p class="tip">ดูวิธีแก้รอบก่อน เพื่อไม่แก้ด้วยวิธีเดิมซ้ำ</p>
        </div>
      } @else {
        <p class="muted">ยังไม่มีประวัติรอบแก้ไขในใบนี้</p>
      }

      @if (closedAgo(); as ago) {
        <p class="ago" [class.ago-warn]="ago.old">
          {{ ago.label }}
          @if (ago.old) {
            <span> — ปิดไปนานแล้ว ยืนยันว่าเป็นอาการเดิม?</span>
          }
        </p>
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
                <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
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
      color: #5b6762;
      font-size: 0.86rem;
    }
    .last-round {
      margin: 0 0 0.75rem;
      padding: 0.75rem 0.85rem;
      border-radius: 10px;
      background: #f0f7f5;
      border: 1px solid #d5e8e2;
      font-size: 0.9rem;
    }
    .last-round strong {
      display: block;
      margin-bottom: 0.35rem;
    }
    .last-round p {
      margin: 0.2rem 0;
    }
    .tip {
      margin-top: 0.45rem !important;
      color: #0f766e;
      font-size: 0.8rem;
    }
    .ago {
      margin: 0 0 0.75rem;
      font-size: 0.88rem;
      color: #334155;
    }
    .ago-warn {
      color: #9a3412;
      font-weight: 500;
    }
    .muted {
      color: #64748b;
      font-size: 0.86rem;
      margin: 0 0 0.75rem;
      line-height: 1.4;
    }
    .dlg-form {
      display: grid;
      gap: 0.25rem;
      min-width: min(720px, 92vw);
    }
    .full {
      width: 100%;
    }
    .error {
      color: #991b1b;
      font-size: 0.86rem;
      margin: 0.35rem 0 0;
    }
  `,
})
export class TicketProblemReturnedDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketProblemReturnedDialogComponent, boolean>);
  readonly data = inject<TicketProblemReturnedDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    symptom: [''],
    assignedUserId: [
      this.data.canAssign
        ? (this.data.defaultAssigneeId ?? this.data.users[0]?.id ?? null)
        : null,
      this.data.canAssign ? [Validators.required, Validators.min(1)] : [],
    ],
  });

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
      .reopen(this.data.ticketId, reason)
      .pipe(
        switchMap(() => {
          if (!this.data.canAssign || !assigneeId) {
            return of({ assigned: false as const });
          }
          return this.ticketsApi.assign(this.data.ticketId, assigneeId).pipe(
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
              'เปิดรอบใหม่แล้ว — สถานะส่งงานแล้ว พร้อมเริ่มรอบถัดไป',
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
  const customerAddr = [
    payload.customer.address,
    payload.customer.phone ? `โทร ${payload.customer.phone}` : null,
  ]
    .filter(Boolean)
    .join('<br>');
  const projectLabel = payload.project
    ? [payload.project.code, payload.project.name].filter(Boolean).join(' · ')
    : '—';
  const contact = payload.reportedByContact;
  const signBlocks = (payload.signatureBlocks?.length
    ? payload.signatureBlocks
    : [
        { role: 'PROVIDER', label: 'ผู้ให้บริการ / ผู้แก้ไข' },
        { role: 'CUSTOMER', label: 'ลูกค้า / ผู้รับมอบงาน' },
      ]
  )
    .map(
      (b) =>
        `<div class="sign-block"><div class="sign-line"></div><p>${escapeHtml(b.label)}</p></div>`
    )
    .join('');

  win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<title>${escapeHtml(payload.documentTitle)} · ${escapeHtml(payload.ticket.ticketNo || '#' + payload.ticket.id)}</title>
<style>
  body{font-family:Sarabun,Segoe UI,sans-serif;margin:1.5rem;color:#0f172a;line-height:1.5}
  h1{font-size:1.25rem;margin:0 0 .35rem}
  .meta{color:#475569;font-size:.9rem;margin:0 0 1rem}
  dl{display:grid;grid-template-columns:8.5rem 1fr;gap:.35rem .75rem;margin:0 0 1.25rem}
  dt{color:#64748b;font-size:.85rem} dd{margin:0;white-space:pre-wrap}
  .sign{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:2rem;margin-top:2.75rem}
  .sign-block{text-align:center;font-size:.88rem}
  .sign-line{border-top:1px solid #94a3b8;margin:3.25rem 0 .5rem;height:0}
  .sign-block p{margin:0;color:#334155}
  @media print{button{display:none}}
</style></head><body>
<button type="button" onclick="window.print()" style="margin-bottom:1rem">พิมพ์</button>
<h1>${escapeHtml(payload.documentTitle)}</h1>
<p class="meta">${escapeHtml(payload.ticket.ticketNo || 'ใบ #' + payload.ticket.id)} · งานครั้งที่ ${r.round}</p>
<dl>
  <dt>ลูกค้า</dt><dd><strong>${escapeHtml(payload.customer.name)}</strong>${payload.customer.code ? ' · ' + escapeHtml(payload.customer.code) : ''}${customerAddr ? '<br>' + customerAddr : ''}</dd>
  <dt>โปรเจกต์</dt><dd>${escapeHtml(projectLabel)}</dd>
  <dt>หัวข้อปัญหา</dt><dd>${escapeHtml(payload.ticket.title)}</dd>
  ${
    contact
      ? `<dt>ผู้แจ้ง</dt><dd>${escapeHtml(contact.name)}${contact.phone ? ' · ' + escapeHtml(contact.phone) : ''}</dd>`
      : ''
  }
  <dt>สาเหตุ</dt><dd>${escapeHtml(r.rootCause?.trim() || '—')}</dd>
  <dt>วิธีแก้ไข</dt><dd>${escapeHtml(r.detail || '—')}</dd>
  <dt>ผลลัพธ์</dt><dd>${escapeHtml(resultLabel)}</dd>
  <dt>ผู้แก้ไข</dt><dd>${escapeHtml(resolver)}</dd>
  <dt>เวลาที่ใช้</dt><dd>${escapeHtml(hours)}</dd>
  <dt>แก้เสร็จเมื่อ</dt><dd>${escapeHtml(formatThaiDateTime(r.resolvedAt) || r.resolvedAt || '—')}</dd>
</dl>
<p>ข้าพเจ้าได้ตรวจสอบผลการแก้ไขแล้ว และยืนยันว่าปัญหาได้รับการแก้ไขตามรายละเอียดข้างต้น</p>
<div class="sign">${signBlocks}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},80)}</script>
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
      color: #64748b;
      font-size: 0.86rem;
    }
    .round-steps {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0.65rem 0.85rem;
      border-radius: 10px;
      background: #f0fdfa;
      border: 1px solid #ccfbf1;
      display: grid;
      gap: 0.45rem;
      font-size: 0.86rem;
      color: #0f766e;
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
      background: #99f6e4;
      color: #115e59;
      font-size: 0.68rem;
      font-weight: 700;
      display: grid;
      place-items: center;
    }
    .round-steps li.is-done {
      opacity: 1;
    }
    .round-steps li.is-failed {
      color: #b91c1c;
    }
    .round-steps li.is-partial {
      color: #b45309;
    }
    .round-steps__main {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.65rem;
      align-items: baseline;
    }
    .round-steps__result {
      font-size: 0.78rem;
      color: #475569;
    }
    .round-steps__at {
      font-size: 0.78rem;
      color: #64748b;
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
      color: #64748b;
    }
    .detail-grid dd {
      margin: 0.15rem 0 0;
      white-space: pre-wrap;
      line-height: 1.45;
      color: #0f172a;
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

