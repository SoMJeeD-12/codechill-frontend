import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  RESOLUTION_RESULT_HINTS,
  RESOLUTION_RESULT_LABELS,
  ResolutionResult,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketResolution,
  TicketStatus,
  buildTicketTimeline,
  isIncompleteResolutionResult,
  latestTicketResolution,
  splitTicketDescription,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import {
  TicketDemoOverlayService,
} from '../../core/services/ticket-demo-overlay.service';
import { TicketService } from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { navigateBack } from '../../core/utils/navigation.util';
import { StatusBarComponent } from '../../shared/components/status-bar.component';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { EMPTY, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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
  readonly canChangeResolver = this.auth.isAdminLevel();

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

  /** แยก description ออกจากบรรทัด「เปิดกลับมาอีกครั้ง」ที่ BE ต่อมา */
  readonly descriptionParts = computed(() =>
    splitTicketDescription(this.ticket()?.description)
  );

  /** ย่อรายการอาการกลับมา — ค่าเริ่มต้นโชว์แค่ครั้งล่าสุด */
  readonly showAllReopenNotes = signal(false);

  /** รายการอาการกลับมา ใหม่→เก่า พร้อมเลขครั้ง */
  readonly reopenNoteRows = computed(() => {
    const notes = this.descriptionParts().reopenNotes;
    return notes
      .map((text, i) => ({ index: i + 1, text }))
      .reverse();
  });

  readonly visibleReopenNotes = computed(() => {
    const rows = this.reopenNoteRows();
    if (this.showAllReopenNotes() || rows.length <= 1) {
      return rows;
    }
    return rows.slice(0, 1);
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
      this.statusLabels[this.displayStatus()]
    );
  });

  readonly statusBarAttr = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    return t ? this.demoOverlay.statusAttr(t) : this.displayStatus();
  });

  readonly categoryLabel = computed(() => {
    this.demoOverlay.state();
    const id = this.ticket()?.id;
    if (id == null) {
      return null;
    }
    return this.demoOverlay.categoryDisplayLabel(id);
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
    const order = ['RECEIVED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
    const idx =
      shown === 'REOPENED'
        ? order.indexOf('RECEIVED')
        : Math.max(0, order.indexOf(shown as (typeof order)[number]));
    return order.map((status, i) => ({
      status,
      label: this.statusLabels[status],
      state: i < idx ? 'done' : i === idx ? 'current' : 'todo',
    }));
  });

  readonly timelineEvents = computed(() => {
    this.demoOverlay.state();
    const t = this.ticket();
    if (!t) {
      return [];
    }
    const overlay = this.demoOverlay.snapshot(t.id);
    return buildTicketTimeline({
      ticket: t,
      assignedAt: overlay.assignedAt ?? null,
      assigneeName: this.userName(t.assignedUserId),
      receiverName: this.userName(t.receivedByUserId),
    }).map((e) =>
      e.id.startsWith('res-')
        ? {
            ...e,
            detail: e.detail
              ? this.resultLabels[e.detail as ResolutionResult] ?? e.detail
              : e.detail,
          }
        : e
    );
  });

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
   * (ปัญหาเดิมกลับมา / รับงานรอบใหม่ / ปิดงาน / เริ่มงาน / ทำต่อหลัง partial)
   */
  readonly ticketNextHint = computed(() => {
    const t = this.ticket();
    if (!t) {
      return null;
    }
    const shown = this.displayStatus();

    if (shown === 'ASSIGNED') {
      if (this.canStartTicket()) {
        return {
          tone: 'warn' as const,
          title: 'ส่งงานแล้ว — รอเริ่มดำเนินการ',
          detail: 'คุณเป็นผู้รับผิดชอบ ต้องกด「เริ่มดำเนินการ」เองก่อนบันทึกการแก้ไข',
          actions: [{ id: 'start' as const, label: 'เริ่มดำเนินการ', primary: true }],
        };
      }
      return {
        tone: 'warn' as const,
        title: 'ส่งงานแล้ว',
        detail: `รอ ${this.userName(t.assignedUserId)} กดเริ่มดำเนินการ`,
        actions: this.canAssign()
          ? [{ id: 'reassign' as const, label: 'เปลี่ยนผู้รับผิดชอบ', primary: false }]
          : [],
      };
    }

    if (t.status === 'REOPENED') {
      if (this.canAssign()) {
        return {
          tone: 'warn' as const,
          title: 'ปัญหาเดิมกลับมาแล้ว — รอรับงานรอบใหม่',
          detail: `เปิดงานครั้งที่ ${this.nextRound()} ในใบเดิมนี้ · มอบหมายผู้รับผิดชอบเพื่อเริ่มแก้`,
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
        id: 'close' | 'print-last';
        label: string;
        primary: boolean;
      }[] = [];
      if (this.canResolve()) {
        actions.push({ id: 'close', label: 'ปิดงาน', primary: true });
      }
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
        title: 'แก้ไขเรียบร้อยแล้ว — รอปิดงาน',
        detail:
          'พิมพ์ใบยืนยันให้ลูกค้าตรวจรับ แล้วกด「ปิดงาน」· ปุ่ม「ปัญหาเดิมกลับมา」จะโชว์หลังปิดงานแล้วเท่านั้น',
        actions,
      };
    }

    if (t.status === 'CLOSED' && this.canReopen()) {
      return {
        tone: 'warn' as const,
        title: 'ใบนี้ปิดแล้ว — ถ้าปัญหาเดิมกลับมา',
        detail:
          'อย่าเปิดใบใหม่ · กดด้านขวาเพื่อเปิดงานครั้งใหม่ในใบเดิม พร้อมดูวิธีแก้รอบก่อน',
        actions: [
          { id: 'reopen' as const, label: 'ปัญหาเดิมกลับมา', primary: true },
        ],
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

  readonly resolutionsPager = createClientPager(this.filteredResolutions);

  private ticketId = 0;

  goBack(): void {
    navigateBack(this.location, this.router, '/app/tickets');
  }

  toggleReopenNotes(): void {
    this.showAllReopenNotes.update((v) => !v);
  }

  ngOnInit(): void {
    this.ticketId = Number(this.route.snapshot.paramMap.get('id'));
    if (!this.ticketId) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.resolutionSearchControl.valueChanges.subscribe((v) => this.resolutionSearch.set(v));
    this.usersApi
      .loadForPicker(this.auth.currentUser(), { capability: 'TICKET' })
      .subscribe();
    this.customersApi.listCustomers().subscribe({ error: () => undefined });
    this.projectsApi.listProjects().subscribe({ error: () => undefined });
    this.loadTicket();
  }

  loadTicket(): void {
    this.loading.set(true);
    this.ticketsApi.get(this.ticketId).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.resolutions.set(
          [...(ticket.resolutions ?? [])].sort((a, b) => b.round - a.round)
        );
        this.demoOverlay.syncIncompleteWorkFromTicket(ticket);
        this.showAllReopenNotes.set(false);
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
    const id = this.ticket()?.customerId;
    return id ? this.customersApi.getCustomer(id)?.name ?? `#${id}` : '—';
  }

  projectName(): string {
    const id = this.ticket()?.projectId;
    if (!id) {
      return '—';
    }
    const p = this.projectsApi.getProject(id);
    return p ? `${p.code} · ${p.name}` : `#${id}`;
  }

  userName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  ticketStatusLabel(status: TicketStatus): string {
    return this.statusLabels[status];
  }

  /** ข้อความรองของแถบสถานะ */
  statusDetail(t: Ticket): string {
    const n = t.resolutionCount || 0;
    const shown = this.displayStatus();
    const last = latestTicketResolution(t);
    if (shown === 'ASSIGNED') {
      return 'ตัวอย่างขั้นมอบหมายแล้ว — กด「เริ่มงาน」เพื่อเข้ากำลังดำเนินการ';
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
      return `งานล่าสุดเสร็จแล้ว · รวมแก้ ${n} ครั้ง — ขั้นถัดไปคือปิดงาน`;
    }
    if (t.status === 'CLOSED') {
      return `ปิดแล้ว · มีงานแก้ไข ${n} ครั้งในใบนี้`;
    }
    return n > 0 ? `มีงานแก้ไขแล้ว ${n} ครั้ง` : 'ยังไม่เริ่มงานแก้ไข';
  }

  runTicketHintAction(
    id: 'pickup' | 'close' | 'reopen' | 'print-last' | 'start' | 'add-resolution' | 'reassign'
  ): void {
    if (id === 'start') {
      this.startAssignedWork();
      return;
    }
    if (id === 'pickup') {
      this.pickupReopened();
      return;
    }
    if (id === 'close') {
      this.closeTicket();
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
    if (shown === 'ASSIGNED') {
      this.snack.open('กด「เริ่มงาน」ก่อน แล้วค่อยบันทึกการแก้ไข', 'ปิด', {
        duration: 4000,
      });
      return;
    }
    if (shown === 'RESOLVED') {
      this.snack.open('สถานะแก้ไขเรียบร้อยแล้ว — ปิดงาน หรือรอปัญหาเดิมกลับมาหลังปิด', 'ปิด', {
        duration: 4000,
      });
      return;
    }
    const ref = this.dialog.open(TicketResolutionFormDialogComponent, {
      ...FORM_DIALOG,
      data: {
        ticketId: this.ticketId,
        canChangeResolver: this.canChangeResolver,
        canHandoff: this.canAssign(),
        defaultResolverId:
          this.auth.currentUser()?.id ?? this.ticket()?.assignedUserId ?? 0,
        currentAssigneeId: this.ticket()?.assignedUserId ?? null,
      },
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
    this.dialog.open(TicketWorkRoundDetailDialogComponent, {
      ...FORM_DIALOG,
      data: {
        ticket,
        resolution: r,
        customerName: this.customerName(),
        projectName: this.projectName(),
        resolverName: this.userName(r.resolvedByUserId),
        ticketNo: ticket.ticketNo || `ใบ #${ticket.id}`,
      } satisfies TicketWorkRoundDetailDialogData,
    });
  }

  /** พิมพ์ใบยืนยันการแก้ให้ลูกค้าเซ็น (FE จัดหน้า — ยังไม่มี API print) */
  printResolutionConfirm(r: TicketResolution): void {
    const ticket = this.ticket();
    if (!ticket) {
      return;
    }
    printTicketResolutionConfirm({
      ticketNo: ticket.ticketNo || `ใบ #${ticket.id}`,
      title: ticket.title,
      customerName: this.customerName(),
      projectName: this.projectName(),
      round: r.round,
      rootCause: r.rootCause,
      detail: r.detail,
      resultLabel: this.resultLabels[r.result],
      resolverName: this.userName(r.resolvedByUserId),
      resolvedAt: r.resolvedAt,
      hoursSpent: r.hoursSpent,
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
        'กด「ปัญหาเดิมกลับมา」ได้หลังปิดงานแล้วเท่านั้น — ตอนนี้ให้ปิดงานก่อน',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    const last = [...this.resolutions()].sort((a, b) => b.round - a.round)[0] ?? null;
    this.usersApi.listAssignable('TICKET').subscribe({
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

  closeTicket(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์ปิดงาน', 'ปิด', { duration: 3000 });
      return;
    }
    const ticket = this.ticket();
    if (!ticket || this.displayStatus() !== 'RESOLVED') {
      this.snack.open(
        'ปิดงานได้เมื่อรอบล่าสุดเป็น「สำเร็จ」แล้ว — สำเร็จบางส่วน/ไม่สำเร็จยังต้องทำต่อ',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    const last = latestTicketResolution(ticket);
    if (last && isIncompleteResolutionResult(last.result)) {
      this.snack.open(
        'รอบล่าสุดยังไม่สำเร็จครบ — บันทึกรอบ「สำเร็จ」ก่อนปิดงาน',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    if ((ticket.resolutionCount ?? 0) < 1) {
      this.snack.open('ยังไม่มีรอบแก้ไข — บันทึกการแก้ไขก่อนปิดงาน', 'ปิด', {
        duration: 4000,
      });
      return;
    }
    this.ticketsApi.close(this.ticketId).subscribe({
      next: () => {
        this.demoOverlay.clearIncompleteWork(this.ticketId);
        this.snack.open('ปิดงานแล้ว — จะหายจากหน้ารอรับแก้ไข', 'ปิด', { duration: 3000 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  /** RECEIVED / REOPENED → มอบหมาย → Backend คืน ASSIGNED */
  assignWork(): void {
    this.pickAssigneeAndAssign('มอบหมายแล้ว — สถานะ「ส่งงานแล้ว」รอผู้รับผิดชอบเริ่มดำเนินการ');
  }

  /** ASSIGNED → PATCH /tickets/:id/start (ผู้รับผิดชอบเท่านั้น) */
  startAssignedWork(): void {
    if (!this.canStartTicket()) {
      this.snack.open('เฉพาะผู้รับผิดชอบเท่านั้นที่เริ่มงานได้', 'ปิด', { duration: 3500 });
      return;
    }
    this.ticketsApi.start(this.ticketId).subscribe({
      next: () => {
        this.demoOverlay.markStarted(this.ticketId);
        this.snack.open('เริ่มดำเนินการแล้ว', 'ปิด', { duration: 2500 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4500 }),
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

    this.usersApi.listAssignable('TICKET').subscribe({
      next: (users) => {
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
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>เพิ่มรอบการแก้ไข</h2>
    <mat-dialog-content>
      <p class="hint">
        บันทึกเป็น<strong>งานแก้ไข</strong>ในใบปัญหานี้ ·
        「สำเร็จ」= จบรอบนี้รอปิดงาน ·
        「สำเร็จบางส่วน / ไม่สำเร็จ」= ยังทำต่อหรือส่งต่อได้ (ใบยังไม่ปิด)
      </p>
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
            <mat-hint>{{ resultHints[selectedResult()] }}</mat-hint>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้แก้ไขรอบนี้</mat-label>
          <mat-select formControlName="resolvedByUserId">
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
          @if (!data.canChangeResolver) {
            <mat-hint>ล็อกเป็นผู้ใช้ที่ล็อกอิน — เปลี่ยนได้เฉพาะ Admin</mat-hint>
          }
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
            <mat-hint>เลือกเมื่อต้องการส่งต่อให้อีกคนทำรอบถัดไป</mat-hint>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="ticket-resolution-form">
        บันทึกรอบนี้
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
  `,
})
export class TicketResolutionFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly demoOverlay = inject(TicketDemoOverlayService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketResolutionFormDialogComponent, boolean>);
  readonly data = inject<TicketResolutionFormData>(MAT_DIALOG_DATA);

  readonly users = this.usersApi.assignableTicket;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly resultHints = RESOLUTION_RESULT_HINTS;
  readonly results = Object.keys(RESOLUTION_RESULT_LABELS) as ResolutionResult[];

  readonly form = this.fb.nonNullable.group({
    rootCause: [''],
    detail: ['', Validators.required],
    hoursSpent: [1, Validators.min(0)],
    result: ['SUCCESS' as ResolutionResult],
    resolvedByUserId: [
      {
        value: this.data.defaultResolverId || this.auth.currentUser()?.id || 0,
        disabled: !this.data.canChangeResolver,
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
    const resolvedByUserId = this.data.canChangeResolver
      ? Number(raw.resolvedByUserId)
      : (me?.id ?? Number(raw.resolvedByUserId));
    const incomplete = isIncompleteResolutionResult(raw.result);
    const handoffUserId =
      incomplete && this.data.canHandoff && raw.handoffUserId != null
        ? Number(raw.handoffUserId)
        : null;

    this.ticketsApi
      .addResolution(this.data.ticketId, {
        rootCause: raw.rootCause.trim() || null,
        detail: raw.detail,
        hoursSpent: Number(raw.hoursSpent) || 0,
        result: raw.result,
        resolvedByUserId,
        resolvedAt: new Date().toISOString(),
      })
      .pipe(
        switchMap(({ quota }) => {
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
              map(() => ({ quota, handedOff: true as const })),
              catchError((err: Error) => {
                this.snack.open(
                  `บันทึกรอบแล้ว แต่ส่งต่อผู้รับผิดชอบไม่สำเร็จ: ${err.message}`,
                  'ปิด',
                  { duration: 6500 }
                );
                return of({ quota, handedOff: false as const });
              })
            );
          }
          return of({ quota, handedOff: false as const });
        })
      )
      .subscribe({
        next: ({ quota, handedOff }) => {
          let msg = incomplete
            ? raw.result === 'PARTIAL'
              ? 'บันทึกสำเร็จบางส่วนแล้ว — ใบยังเปิดอยู่ ทำต่อหรือส่งต่อได้'
              : 'บันทึกไม่สำเร็จแล้ว — ใบยังเปิดอยู่ ทำต่อหรือส่งต่อได้'
            : 'บันทึกรอบสำเร็จแล้ว — รอปิดงาน';
          if (handedOff) {
            msg += ' · ส่งต่อผู้รับผิดชอบแล้ว';
          }
          if (quota) {
            msg += ` · โควตา ${quota.periodStart}–${quota.periodEnd}: เหลือ ${quota.remaining}/${quota.quota}`;
            if (quota.isOverQuota) {
              msg += ' (เกินโควตา)';
            }
          }
          this.snack.open(msg, 'ปิด', {
            duration: quota?.isOverQuota || incomplete ? 5000 : 2800,
          });
          this.ref.close(true);
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4500 }),
      });
  }
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

/* ——— รายละเอียดงานแก้ไข 1 ครั้ง + พิมพ์ใบยืนยัน ——— */

export interface TicketWorkRoundDetailDialogData {
  ticket: Ticket;
  resolution: TicketResolution;
  customerName: string;
  projectName: string;
  resolverName: string;
  ticketNo: string;
}

export interface TicketResolutionPrintInput {
  ticketNo: string;
  title: string;
  customerName: string;
  projectName: string;
  round: number;
  rootCause: string | null;
  detail: string;
  resultLabel: string;
  resolverName: string;
  resolvedAt: string;
  hoursSpent: number | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ใบยืนยันการแก้ปัญหาให้ลูกค้าเซ็น — จัดหน้าฝั่ง FE (ยังไม่มี API print) */
export function printTicketResolutionConfirm(input: TicketResolutionPrintInput): void {
  const win = window.open('', '_blank');
  if (!win) {
    return;
  }
  const hours =
    input.hoursSpent != null ? `${input.hoursSpent} ชั่วโมง` : '—';
  win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<title>ใบยืนยันการแก้ไข · ${escapeHtml(input.ticketNo)}</title>
<style>
  body{font-family:Sarabun,Segoe UI,sans-serif;margin:1.5rem;color:#0f172a;line-height:1.5}
  h1{font-size:1.25rem;margin:0 0 .35rem}
  .meta{color:#475569;font-size:.9rem;margin:0 0 1rem}
  dl{display:grid;grid-template-columns:8rem 1fr;gap:.35rem .75rem;margin:0 0 1.25rem}
  dt{color:#64748b;font-size:.85rem} dd{margin:0;white-space:pre-wrap}
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:2.5rem}
  .sign div{border-top:1px solid #94a3b8;padding-top:.5rem;text-align:center;font-size:.88rem}
  @media print{button{display:none}}
</style></head><body>
<button type="button" onclick="window.print()" style="margin-bottom:1rem">พิมพ์</button>
<h1>ใบยืนยันการแก้ไขปัญหา</h1>
<p class="meta">${escapeHtml(input.ticketNo)} · งานครั้งที่ ${input.round}</p>
<dl>
  <dt>ลูกค้า</dt><dd>${escapeHtml(input.customerName)}</dd>
  <dt>โปรเจค</dt><dd>${escapeHtml(input.projectName)}</dd>
  <dt>หัวข้อปัญหา</dt><dd>${escapeHtml(input.title)}</dd>
  <dt>สาเหตุ</dt><dd>${escapeHtml(input.rootCause?.trim() || '—')}</dd>
  <dt>วิธีแก้ไข</dt><dd>${escapeHtml(input.detail || '—')}</dd>
  <dt>ผลลัพธ์</dt><dd>${escapeHtml(input.resultLabel)}</dd>
  <dt>ผู้แก้ไข</dt><dd>${escapeHtml(input.resolverName)}</dd>
  <dt>เวลาที่ใช้</dt><dd>${escapeHtml(hours)}</dd>
  <dt>แก้เสร็จเมื่อ</dt><dd>${escapeHtml(input.resolvedAt || '—')}</dd>
</dl>
<p>ข้าพเจ้าได้ตรวจสอบผลการแก้ไขแล้ว และยืนยันว่าปัญหาได้รับการแก้ไขตามรายละเอียดข้างต้น</p>
<div class="sign">
  <div>ผู้แก้ไข / วันที่</div>
  <div>ลูกค้า / ผู้รับมอบ / วันที่</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},80)}</script>
</body></html>`);
  win.document.close();
}

@Component({
  selector: 'app-ticket-work-round-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>งานครั้งที่ {{ data.resolution.round }}</h2>
    <mat-dialog-content>
      <p class="ticket-ref">{{ data.ticketNo }} · {{ data.ticket.title }}</p>

      <ol class="round-steps" aria-label="ลำดับงานครั้งนี้">
        <li class="is-done">รับเรื่องในใบนี้</li>
        <li class="is-done">มอบหมาย / ดำเนินการ</li>
        <li class="is-done">บันทึกการแก้ไข</li>
        <li class="is-done">พร้อมให้ลูกค้ายืนยัน</li>
      </ol>

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
          <dd>{{ data.resolution.resolvedAt || '—' }}</dd>
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
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
      <button mat-stroked-button type="button" (click)="print()">
        <mat-icon>print</mat-icon>
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
      margin: 0 0 1rem;
      padding: 0.65rem 0.85rem 0.65rem 1.35rem;
      border-radius: 10px;
      background: #f0fdfa;
      border: 1px solid #ccfbf1;
      display: grid;
      gap: 0.25rem;
      font-size: 0.86rem;
      color: #0f766e;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 0.85rem;
      margin: 0;
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
    mat-dialog-actions mat-icon {
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
    }
  `,
})
export class TicketWorkRoundDetailDialogComponent {
  readonly data = inject<TicketWorkRoundDetailDialogData>(MAT_DIALOG_DATA);
  readonly resultLabels = RESOLUTION_RESULT_LABELS;

  print(): void {
    printTicketResolutionConfirm({
      ticketNo: this.data.ticketNo,
      title: this.data.ticket.title,
      customerName: this.data.customerName,
      projectName: this.data.projectName,
      round: this.data.resolution.round,
      rootCause: this.data.resolution.rootCause,
      detail: this.data.resolution.detail,
      resultLabel: this.resultLabels[this.data.resolution.result],
      resolverName: this.data.resolverName,
      resolvedAt: this.data.resolution.resolvedAt,
      hoursSpent: this.data.resolution.hoursSpent,
    });
  }
}
