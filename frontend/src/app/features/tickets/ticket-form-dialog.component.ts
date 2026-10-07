import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EMPTY, merge, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';
import {
  BILLING_TYPE_LABELS,
  BillingType,
  REPORTED_CHANNEL_LABELS,
  ReportedChannel,
  TICKET_PRIORITY_LABELS,
  Ticket,
  TicketPriority,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import {
  TICKET_CATEGORY_DEMO_LABELS,
  TicketCategoryDemo,
  TicketDemoOverlayService,
} from '../../core/services/ticket-demo-overlay.service';
import {
  TicketBillingSuggestion,
  TicketCreateInput,
  TicketService,
  TicketUpdateInput,
} from '../../core/services/ticket.service';
import {
  combineDateAndTime,
  nowTimeString,
  parseDateOnly,
  toTimeString,
} from '../../core/utils/date.util';
import {
  EntityPickerComponent,
  PickerOption,
} from '../../shared/components/entity-picker.component';
import {
  customerSearchFn,
  projectPickerOptionOrNull,
  projectSearchFn,
} from '../../shared/components/entity-search';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { warnHttpError } from '../../shared/utils/swallow-http-error';
import { parseMoneyValue } from '../../core/utils/money.util';

/** ทุกประเภท — คนเปลี่ยนได้เสมอ ห้ามซ่อนตามประกัน/MA ที่ FE ประกอบเอง */
const ALL_BILLING_TYPES: BillingType[] = [
  'WARRANTY',
  'MA_QUOTA',
  'ADDON',
  'ONE_TIME',
  'FREE',
];

export interface TicketFormDialogData {
  /** ใบเดิม = โหมดแก้ไข */
  ticket?: Ticket | null;
  /** ล็อกลูกค้าไว้ล่วงหน้า (เปิดจากหน้าลูกค้า) */
  customer?: PickerOption | null;
  /** ล็อกโปรเจกต์ไว้ล่วงหน้า (เปิดจากหน้าโปรเจกต์) */
  project?: PickerOption | null;
}

/**
 * เปิดใบแจ้งปัญหา
 *
 * ประเภทคิดเงิน: GET /tickets/billing-suggestion เป็นหลัก (ประกันมาก่อน MA)
 * คนเลือก billingType เองได้เสมอ — POST ส่งค่าที่เลือก ไม่บังคับตาม suggested
 */
@Component({
  selector: 'app-ticket-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule,
    MatDatepickerModule,
    ThaiTimeInputDirective,
    MoneyInputDirective,
    ThaiDatePipe,
    EntityPickerComponent,
  ],
  templateUrl: './ticket-form-dialog.component.html',
  styleUrl: './ticket-form-dialog.component.scss',
})
export class TicketFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly demoOverlay = inject(TicketDemoOverlayService);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ref = inject(MatDialogRef<TicketFormDialogComponent, boolean>);
  private readonly data = inject<TicketFormDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });

  private readonly ticket: Ticket | null = this.data?.ticket ?? null;
  readonly isEdit = !!this.ticket;

  /** Q11 — ห้ามทำหมวดหมู่จนกว่า BE จะมีฟิลด์จริง */
  readonly showCategoryField = false;

  readonly channelLabels = REPORTED_CHANNEL_LABELS;
  readonly channels = Object.keys(REPORTED_CHANNEL_LABELS) as ReportedChannel[];
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly billingTypes = ALL_BILLING_TYPES;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;
  readonly priorities: TicketPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
  readonly categoryLabels = TICKET_CATEGORY_DEMO_LABELS;
  readonly categories = Object.keys(TICKET_CATEGORY_DEMO_LABELS) as TicketCategoryDemo[];
  readonly categorySelection = signal<TicketCategoryDemo | null>(
    this.ticket
      ? (this.demoOverlay.snapshot(this.ticket.id).category ?? null)
      : null
  );

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** ปัญหาใหม่ = POST /tickets · ปัญหาเดิมกลับมา = reopen ใบที่ปิดแล้ว (ไม่สร้างใบใหม่) */
  readonly mode = signal<'new' | 'returned'>('new');
  readonly canReopen = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.reopen');
  });
  readonly canAssign = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.assign');
  });
  readonly closedTickets = signal<Ticket[]>([]);
  readonly closedTotal = signal(0);
  readonly closedLoading = signal(false);
  readonly oldTicket = signal<Ticket | null>(null);
  readonly closedSearch = this.fb.nonNullable.control('');
  readonly reopenSymptom = this.fb.nonNullable.control('', Validators.required);
  readonly reopenAssignee = this.fb.control<number | null>(null);
  readonly assignableUsers = this.usersApi.assignableTicket;
  private closedRequest = 0;

  readonly customer = signal<PickerOption | null>(null);
  readonly project = signal<PickerOption | null>(null);
  /** true เมื่อลูกค้าถูกเติมจากโปรเจกต์ — ห้ามแก้มือ */
  readonly customerFromProject = signal(false);

  readonly billingSelection = signal<BillingType | null>(null);
  /** สรุปจาก GET /tickets/billing-suggestion — null = ซ่อนแถบ */
  readonly billingSuggestion = signal<TicketBillingSuggestion | null>(null);
  /** ผู้ใช้เลือกคิดเงินเองแล้ว — อย่าทับด้วย suggestion */
  private billingPickedByUser = false;
  private suggestionRequest = 0;

  readonly form = this.fb.group({
    title: [this.ticket?.title ?? '', Validators.required],
    description: [this.ticket?.description ?? '', Validators.required],
    priority: [(this.ticket?.priority ?? 'NORMAL') as TicketPriority],
    reportedChannel: [(this.ticket?.reportedChannel ?? 'PHONE') as ReportedChannel],
    category: [
      (this.ticket
        ? (this.demoOverlay.snapshot(this.ticket.id).category ?? null)
        : null) as TicketCategoryDemo | null,
    ],
    categoryOtherNote: [
      this.ticket
        ? (this.demoOverlay.snapshot(this.ticket.id).categoryOtherNote ?? '')
        : '',
    ],
    billingType: [
      (this.ticket?.billingType ?? 'ONE_TIME') as BillingType,
      Validators.required,
    ],
    extraCharge: [
      this.ticket
        ? (this.demoOverlay.effectiveExtraCharge(this.ticket) as number | null)
        : (null as number | null),
      Validators.min(0),
    ],
    reportedDate: [
      (this.ticket ? parseDateOnly(this.ticket.reportedAt) : new Date()) as Date | null,
      Validators.required,
    ],
    reportedTime: [
      this.ticket ? toTimeString(this.ticket.reportedAt) : nowTimeString(),
      Validators.required,
    ],
  });

  constructor() {
    this.billingSelection.set((this.ticket?.billingType ?? 'ONE_TIME') as BillingType);

    const presetProject = this.data?.project ?? this.projectOptionFrom(this.ticket);
    const presetCustomer = this.data?.customer ?? this.customerOptionFrom(this.ticket);
    if (presetProject) {
      this.project.set(presetProject);
    }
    if (presetCustomer) {
      this.customer.set(presetCustomer);
      this.customerFromProject.set(!!presetProject);
    }

    this.form.controls.billingType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.billingSelection.set((value as BillingType) ?? null));

    this.form.controls.category.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const cat = (value as TicketCategoryDemo | null) ?? null;
        this.categorySelection.set(cat);
        this.syncCategoryOtherValidators(cat);
      });
    this.syncCategoryOtherValidators(this.categorySelection());

    if (!this.isEdit) {
      merge(
        this.form.controls.reportedDate.valueChanges,
        this.form.controls.reportedTime.valueChanges
      )
        .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.loadBillingSuggestion(this.project()?.id ?? null));

      if (presetProject?.id) {
        this.loadBillingSuggestion(presetProject.id);
      }

      this.closedSearch.valueChanges
        .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.loadClosedTickets());
    }
  }

  setMode(mode: 'new' | 'returned'): void {
    if (this.mode() === mode) {
      return;
    }
    this.mode.set(mode);
    this.error.set(null);
    if (mode === 'returned') {
      this.loadClosedTickets();
      if (this.canAssign() && !this.assignableUsers().length) {
        this.usersApi.listAssignable('TICKET').subscribe({ error: () => undefined });
      }
    }
  }

  /** ใบที่ปิดแล้วของโปรเจกต์ (หรือลูกค้า) ที่เลือก — GET /tickets?status=CLOSED */
  loadClosedTickets(): void {
    if (this.mode() !== 'returned') {
      return;
    }
    const projectId = this.project()?.id ?? null;
    const customerId = this.customer()?.id ?? null;
    const requestId = ++this.closedRequest;
    if (projectId == null && customerId == null) {
      this.closedTickets.set([]);
      this.closedTotal.set(0);
      this.closedLoading.set(false);
      return;
    }
    this.closedLoading.set(true);
    this.ticketsApi
      .listPage({
        status: 'CLOSED',
        ...(projectId != null ? { projectId } : { customerId: customerId! }),
        search: this.closedSearch.value.trim() || undefined,
        page: 1,
        limit: 20,
      })
      .subscribe({
        next: (body) => {
          if (requestId !== this.closedRequest) {
            return;
          }
          this.closedTickets.set(body.items);
          this.closedTotal.set(body.total);
          this.closedLoading.set(false);
        },
        error: (err: Error) => {
          if (requestId !== this.closedRequest) {
            return;
          }
          this.closedTickets.set([]);
          this.closedTotal.set(0);
          this.closedLoading.set(false);
          this.error.set(err.message);
        },
      });
  }

  pickOldTicket(t: Ticket): void {
    this.oldTicket.set(t);
    this.error.set(null);
    this.reopenAssignee.setValue(this.canAssign() ? t.assignedUserId : null);
    if (t.projectId && t.projectId !== this.project()?.id) {
      this.loadBillingSuggestion(t.projectId);
    }
  }

  clearOldTicket(): void {
    this.oldTicket.set(null);
  }

  /** เทียบสิทธิ์ของใบเดิมกับสิทธิ์ ณ วันนี้ (billing-suggestion) */
  readonly coverageWarning = computed(() => {
    const t = this.oldTicket();
    const s = this.billingSuggestion();
    if (!t || !s) {
      return null;
    }
    if (t.billingType === 'WARRANTY' && s.suggested !== 'WARRANTY') {
      return 'ใบเดิมใช้ประกัน แต่วันนี้ระบบไม่พบประกันที่ครอบคลุมแล้ว — ตรวจก่อนว่ารอบนี้ยังเป็นงานในประกันหรือไม่';
    }
    if (t.billingType === 'MA_QUOTA' && s.maIsExhausted && !s.maIsReferenceOnly) {
      return 'ใบเดิมใช้โควตา MA แต่ตอนนี้โควตาเต็มแล้ว';
    }
    if (t.billingType === 'MA_QUOTA' && s.suggested !== 'MA_QUOTA' && !s.maPlanName) {
      return 'ใบเดิมใช้โควตา MA แต่วันนี้ระบบไม่พบสัญญา MA ที่ใช้งานอยู่';
    }
    return null;
  });

  private saveReturned(): void {
    const t = this.oldTicket();
    if (!t) {
      this.error.set('เลือกใบเดิมที่ปัญหากลับมาก่อน');
      return;
    }
    if (this.reopenSymptom.invalid) {
      this.reopenSymptom.markAsTouched();
      this.error.set('กรอกอาการที่กลับมาก่อนบันทึก');
      return;
    }
    const reason = this.reopenSymptom.value.trim();
    const assigneeId = this.canAssign() ? this.reopenAssignee.value : null;
    const no = t.ticketNo?.trim() || `ใบ #${t.id}`;

    this.saving.set(true);
    this.error.set(null);
    this.ticketsApi
      .reopen(t.id, reason)
      .pipe(
        switchMap(() => {
          if (!assigneeId) {
            return of(false);
          }
          return this.ticketsApi.assign(t.id, assigneeId).pipe(
            switchMap(() => of(true)),
            catchError((err: Error) => {
              this.saving.set(false);
              this.snack.open(
                `เปิด ${no} กลับมาแล้ว แต่ยังมอบหมายไม่สำเร็จ: ${err.message}`,
                'ปิด',
                { duration: 6500 }
              );
              this.ref.close(true);
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        next: (assigned) => {
          this.saving.set(false);
          this.snack.open(
            assigned
              ? `เปิด ${no} รอบใหม่แล้ว — ส่งงานให้ผู้รับผิดชอบแล้ว`
              : `เปิด ${no} กลับมาแล้ว — อยู่ในคิวแอดมิน「รอรับงานรอบใหม่」`,
            'ปิด',
            { duration: 4500 }
          );
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  /** คนเลือกเอง — ไม่ทับด้วยค่าที่ระบบเสนอ */
  onBillingTypePicked(): void {
    this.billingPickedByUser = true;
  }

  billingSuggestionLabel(): string | null {
    const suggested = this.billingSuggestion()?.suggested ?? null;
    return suggested ? this.billingLabels[suggested] : null;
  }

  hasWarrantyCoverage(s: TicketBillingSuggestion): boolean {
    return !!(s.warrantyEndDate || s.warrantyScopeNote);
  }

  hasMaCoverage(s: TicketBillingSuggestion): boolean {
    return (
      s.maPlanName != null ||
      s.maRemaining != null ||
      s.maIsExhausted ||
      s.maIsReferenceOnly
    );
  }

  private syncCategoryOtherValidators(category: TicketCategoryDemo | null): void {
    const ctrl = this.form.controls.categoryOtherNote;
    if (this.showCategoryField && category === 'OTHER') {
      ctrl.setValidators([Validators.required, Validators.maxLength(80)]);
    } else {
      ctrl.clearValidators();
      ctrl.setValue('', { emitEvent: false });
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  readonly searchProjects = projectSearchFn(this.projectsApi);
  readonly searchCustomers = customerSearchFn(this.customersApi);

  onProjectPicked(option: PickerOption | null): void {
    this.project.set(option);
    this.error.set(null);
    this.billingPickedByUser = false;

    if (!option) {
      if (this.customerFromProject()) {
        this.customer.set(null);
        this.customerFromProject.set(false);
      }
      this.clearBillingSuggestion();
      this.oldTicket.set(null);
      this.loadClosedTickets();
      return;
    }

    this.oldTicket.set(null);
    this.loadClosedTickets();
    this.projectsApi.fetchProject(option.id).subscribe({
      next: (project) => {
        if (project.customer) {
          this.customer.set({
            id: project.customer.id,
            label: project.customer.name,
            meta: 'เติมจากโปรเจกต์ที่เลือก',
          });
          this.customerFromProject.set(true);
        }
      },
      error: () => undefined,
    });

    this.loadBillingSuggestion(option.id);
  }

  onCustomerPicked(option: PickerOption | null): void {
    this.customer.set(option);
    this.customerFromProject.set(false);
    this.error.set(null);
    this.oldTicket.set(null);
    this.loadClosedTickets();
  }

  clearCustomerLock(): void {
    this.customer.set(null);
    this.customerFromProject.set(false);
    this.project.set(null);
    this.clearBillingSuggestion();
    this.oldTicket.set(null);
    this.loadClosedTickets();
  }

  /**
   * GET /tickets/billing-suggestion — ยิงเมื่อมี projectId + reportedAt
   * ยังไม่เลือกโปรเจกต์ = ซ่อนแถบ อย่าเรียก API
   */
  private loadBillingSuggestion(projectId: number | null): void {
    if (this.isEdit || projectId == null || projectId <= 0) {
      this.clearBillingSuggestion();
      return;
    }
    const reportedDate = this.form.controls.reportedDate.value;
    const reportedTime = this.form.controls.reportedTime.value;
    if (!reportedDate || !String(reportedTime ?? '').trim()) {
      this.clearBillingSuggestion();
      return;
    }
    const reportedAt = combineDateAndTime(reportedDate, reportedTime);
    if (!reportedAt) {
      this.clearBillingSuggestion();
      return;
    }
    const requestId = ++this.suggestionRequest;
    this.ticketsApi.getBillingSuggestion(projectId, reportedAt).subscribe({
      next: (suggestion) => {
        if (requestId !== this.suggestionRequest) {
          return;
        }
        this.billingSuggestion.set(suggestion);
        if (this.billingPickedByUser) {
          return;
        }
        // ค่าเริ่มต้น = suggested · null → ONE_TIME · คนเปลี่ยนได้เสมอ
        const next = suggestion.suggested ?? 'ONE_TIME';
        this.form.patchValue({ billingType: next }, { emitEvent: false });
        this.billingSelection.set(next);
      },
      error: (err) => {
        if (requestId !== this.suggestionRequest) {
          return;
        }
        warnHttpError(err, 'ticket-form billing-suggestion');
        this.clearBillingSuggestion();
      },
    });
  }

  private clearBillingSuggestion(): void {
    this.suggestionRequest += 1;
    this.billingSuggestion.set(null);
  }

  save(): void {
    if (!this.isEdit && this.mode() === 'returned') {
      this.saveReturned();
      return;
    }
    const customerId = this.customer()?.id ?? null;
    if (customerId == null) {
      this.error.set('เลือกโปรเจกต์ หรือเลือกลูกค้าก่อนเปิดใบ');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.billingType.invalid) {
        this.error.set('เลือกประเภทการคิดค่าใช้จ่ายก่อนบันทึก');
      } else if (this.form.controls.categoryOtherNote.invalid) {
        this.error.set('ระบุหมวดหมู่เมื่อเลือก「อื่น ๆ」');
      } else {
        this.error.set('กรอกหัวข้อและรายละเอียดปัญหาก่อนบันทึก');
      }
      return;
    }

    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.ticket) {
      const update: TicketUpdateInput = {
        title: raw.title ?? '',
        description: (raw.description ?? '').trim() || null,
        priority: (raw.priority as TicketPriority) ?? 'NORMAL',
        billingType: raw.billingType as BillingType,
        reportedChannel: (raw.reportedChannel as ReportedChannel) ?? 'PHONE',
        reportedAt: combineDateAndTime(raw.reportedDate, raw.reportedTime),
        projectId: this.project()?.id ?? null,
      };
      this.ticketsApi.update(this.ticket.id, update).subscribe({
        next: () => {
          if (this.showCategoryField) {
            this.persistDemoCategory(
              this.ticket!.id,
              raw.category as TicketCategoryDemo | null,
              raw.categoryOtherNote
            );
          }
          this.persistDemoExtraCharge(this.ticket!.id, raw.billingType, raw.extraCharge);
          this.saving.set(false);
          this.snack.open('บันทึกการแก้ไขแล้ว', 'ปิด', { duration: 2800 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
      return;
    }

    const payload: TicketCreateInput = {
      customerId,
      projectId: this.project()?.id ?? null,
      title: raw.title ?? '',
      description: (raw.description ?? '').trim() || null,
      priority: (raw.priority as TicketPriority) ?? 'NORMAL',
      billingType: raw.billingType as BillingType,
      reportedChannel: (raw.reportedChannel as ReportedChannel) ?? 'PHONE',
      reportedAt: combineDateAndTime(raw.reportedDate, raw.reportedTime),
      receivedByUserId: this.auth.currentUser()?.id ?? null,
    };

    this.ticketsApi.create(payload).subscribe({
      next: (created) => {
        if (this.showCategoryField) {
          this.persistDemoCategory(
            created.id,
            raw.category as TicketCategoryDemo | null,
            raw.categoryOtherNote
          );
        }
        this.persistDemoExtraCharge(created.id, raw.billingType, raw.extraCharge);
        this.saving.set(false);
        const no = created.ticketNo?.trim();
        this.snack.open(
          no ? `เปิดใบแจ้งปัญหาแล้ว · ${no}` : 'เปิดใบแจ้งปัญหาแล้ว',
          'ปิด',
          { duration: no ? 5000 : 2800 }
        );
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private persistDemoCategory(
    ticketId: number,
    category: TicketCategoryDemo | null,
    otherNote: unknown
  ): void {
    if (!category) {
      this.demoOverlay.setCategory(ticketId, null, null);
      return;
    }
    const note =
      typeof otherNote === 'string' ? otherNote.trim() || null : null;
    this.demoOverlay.setCategory(ticketId, category, note);
  }

  private persistDemoExtraCharge(
    ticketId: number,
    billingType: BillingType | null | undefined,
    rawCharge: unknown
  ): void {
    if (billingType !== 'ONE_TIME') {
      this.demoOverlay.setExtraCharge(ticketId, null);
      return;
    }
    if (typeof rawCharge === 'number' && Number.isFinite(rawCharge)) {
      this.demoOverlay.setExtraCharge(ticketId, rawCharge);
      return;
    }
    const amount = parseMoneyValue(
      rawCharge == null ? null : String(rawCharge)
    );
    this.demoOverlay.setExtraCharge(
      ticketId,
      amount != null && !Number.isNaN(amount) ? amount : null
    );
  }

  private projectOptionFrom(ticket: Ticket | null): PickerOption | null {
    return projectPickerOptionOrNull(ticket?.project);
  }

  private customerOptionFrom(ticket: Ticket | null): PickerOption | null {
    if (!ticket?.customer) {
      return null;
    }
    return { id: ticket.customer.id, label: ticket.customer.name };
  }
}
