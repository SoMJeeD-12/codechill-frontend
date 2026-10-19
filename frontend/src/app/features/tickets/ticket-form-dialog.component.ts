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
import { EMPTY, Observable, merge, of } from 'rxjs';
import { catchError, debounceTime, map, shareReplay, switchMap } from 'rxjs/operators';
import {
  BILLING_TYPE_LABELS,
  BillingType,
  REPORTED_CHANNEL_LABELS,
  ReportedChannel,
  TICKET_PRIORITY_LABELS,
  Ticket,
  TicketPriority,
  splitTicketSystemLines,
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
  projectPickerOption,
} from '../../shared/components/entity-search';
import { Project } from '../../core/models/project.model';
import { UserOptionComponent } from '../../shared/components/user-option.component';
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

/** กรอกค่าใช้จ่ายเพิ่มได้เฉพาะคิดครั้งคราว / ของเสริม */
function chargeableBilling(type: BillingType | null | undefined): boolean {
  return type === 'ONE_TIME' || type === 'ADDON';
}

/** extraCharge ของ API เป็น string ทศนิยม — ว่าง = null (ยังไม่กรอก) */
function moneyToApiString(raw: unknown): string | null {
  const amount =
    typeof raw === 'number' ? raw : parseMoneyValue(raw == null ? null : String(raw));
  return amount != null && Number.isFinite(amount) ? amount.toFixed(2) : null;
}

/** ป้ายโปรเจกต์ในฟอร์มนี้แสดงแค่ชื่อ — ตัด "รหัส · " ที่หน้าอื่นส่งมา */
function nameOnlyOption(opt: PickerOption | null | undefined): PickerOption | null {
  if (!opt) {
    return null;
  }
  const prefix = opt.code ? `${opt.code} · ` : '';
  const label = prefix && opt.label.startsWith(prefix) ? opt.label.slice(prefix.length) : opt.label;
  return { ...opt, label, code: null };
}

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
    UserOptionComponent,
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
  /** ใบใหม่ส่งเข้าคิวแอดมินทันที — ซัพพอร์ตไม่ต้องกด「ส่งให้แอดมิน」ซ้ำ */
  readonly canSendToAdmin = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.support_queue');
  });
  readonly closedTickets = signal<Ticket[]>([]);
  readonly closedTotal = signal(0);
  readonly closedLoading = signal(false);
  readonly oldTicket = signal<Ticket | null>(null);
  readonly today = new Date();
  readonly closedSearch = this.fb.nonNullable.control('');
  readonly reopenSymptom = this.fb.nonNullable.control('', Validators.required);
  readonly reopenAssignee = this.fb.control<number | null>(null);
  readonly assignableUsers = this.usersApi.assignableTicket;
  private closedRequest = 0;

  readonly customer = signal<PickerOption | null>(null);
  readonly project = signal<PickerOption | null>(null);
  /** โปรเจกต์ของลูกค้าที่เลือก — โหลดครั้งเดียวต่อลูกค้า */
  private customerProjects$: Observable<Project[]> | null = null;

  readonly billingSelection = signal<BillingType | null>(null);
  /** สรุปจาก GET /tickets/billing-suggestion — null = ซ่อนแถบ */
  readonly billingSuggestion = signal<TicketBillingSuggestion | null>(null);
  /** ผู้ใช้เลือกคิดเงินเองแล้ว — อย่าทับด้วย suggestion */
  private billingPickedByUser = false;
  private suggestionRequest = 0;

  /** บรรทัดที่ระบบต่อท้าย ([ตรวจผ่าน] / [ตรวจไม่ผ่าน] / [ปิดงาน] ฯลฯ) — โชว์อ่านอย่างเดียว ส่งกลับตามเดิม */
  private readonly descriptionParts = splitTicketSystemLines(this.ticket?.description);
  readonly systemDescriptionLines = this.descriptionParts.systemLines;

  readonly form = this.fb.group({
    title: [this.ticket?.title ?? '', Validators.required],
    description: [this.descriptionParts.base, Validators.required],
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

    const presetProject = nameOnlyOption(this.data?.project) ?? this.projectOptionFrom(this.ticket);
    const presetCustomer = this.data?.customer ?? this.customerOptionFrom(this.ticket);
    if (presetProject) {
      this.project.set(presetProject);
    }
    if (presetCustomer) {
      this.customer.set(presetCustomer);
    } else if (presetProject) {
      this.projectsApi.fetchProject(presetProject.id).subscribe({
        next: (p) => {
          if (p.customer && !this.customer()) {
            this.customer.set({ id: p.customer.id, label: p.customer.name });
          }
        },
        error: () => undefined,
      });
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
    this.saving.set(true);
    this.error.set(null);
    this.ticketsApi
      .reopen(t.id, reason, this.auth.currentUser()?.id ?? null)
      .pipe(
        switchMap((reopened) => {
          // ไม่เลือกผู้รับผิดชอบ = ส่งเข้าคิวแอดมิน「รอรับ」ให้แอดมินคนไหนก็รับได้
          // เลือกเอง = ผู้เปิดรับคิวเป็นแอดมินผู้รับคิวก่อน แล้วค่อยมอบหมาย
          const next = !assigneeId
            ? this.ticketsApi.sendToAdmin(t.id)
            : reopened.claimedByAdminUserId
              ? this.ticketsApi.assign(t.id, assigneeId)
              : this.ticketsApi.sendToAdmin(t.id).pipe(
                  switchMap(() => this.ticketsApi.claim(t.id)),
                  switchMap(() => this.ticketsApi.assign(t.id, assigneeId))
                );
          return next.pipe(
            switchMap(() => of(!!assigneeId)),
            catchError((err: Error) => {
              this.saving.set(false);
              this.snack.open(
                assigneeId
                  ? `เปิดใบกลับมาแล้ว แต่ยังมอบหมายไม่สำเร็จ: ${err.message}`
                  : `เปิดใบกลับมาแล้ว แต่ยังส่งเข้าคิวแอดมินไม่สำเร็จ: ${err.message}`,
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
              ? 'เปิดใบรอบใหม่แล้ว — ส่งงานให้ผู้รับผิดชอบแล้ว'
              : 'เปิดใบกลับมาแล้ว — ส่งเข้าคิวแอดมิน「รอรับ」แล้ว',
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

  readonly searchCustomers = customerSearchFn(this.customersApi);

  /** ค้นเฉพาะโปรเจกต์ของลูกค้าที่เลือก — แสดงแค่ชื่อ */
  readonly searchProjects = (query: string): Observable<PickerOption[]> => {
    const customerId = this.customer()?.id;
    if (customerId == null) {
      return of([]);
    }
    this.customerProjects$ ??= this.projectsApi
      .listProjectsByCustomer(customerId)
      .pipe(shareReplay(1));
    const q = query.trim().toLowerCase();
    return this.customerProjects$.pipe(
      map((list) =>
        list
          .filter((p) => !q || p.name.toLowerCase().includes(q))
          .map((p) => ({ ...projectPickerOption(p), label: p.name, code: null }))
      ),
      catchError((err: Error) => {
        this.customerProjects$ = null;
        throw err;
      })
    );
  };

  onProjectPicked(option: PickerOption | null): void {
    this.project.set(option);
    this.error.set(null);
    this.billingPickedByUser = false;
    this.oldTicket.set(null);
    this.loadClosedTickets();
    if (option) {
      this.loadBillingSuggestion(option.id);
    } else {
      this.clearBillingSuggestion();
    }
  }

  onCustomerPicked(option: PickerOption | null): void {
    if (option?.id === this.customer()?.id) {
      return;
    }
    this.customer.set(option);
    this.customerProjects$ = null;
    this.project.set(null);
    this.billingPickedByUser = false;
    this.clearBillingSuggestion();
    this.error.set(null);
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
      this.error.set('เลือกลูกค้าก่อนเปิดใบ');
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
      const description = [(raw.description ?? '').trim(), ...this.systemDescriptionLines]
        .filter(Boolean)
        .join('\n');
      const billingType = raw.billingType as BillingType;
      const update: TicketUpdateInput = {
        title: raw.title ?? '',
        description: description || null,
        ...(chargeableBilling(billingType)
          ? { extraCharge: moneyToApiString(raw.extraCharge) }
          : {}),
        priority: (raw.priority as TicketPriority) ?? 'NORMAL',
        billingType,
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
        const opened = 'เปิดใบแจ้งปัญหาแล้ว';
        if (!this.canSendToAdmin()) {
          this.saving.set(false);
          this.snack.open(opened, 'ปิด', { duration: 2800 });
          this.ref.close(true);
          return;
        }
        this.ticketsApi.sendToAdmin(created.id).subscribe({
          next: () => {
            this.saving.set(false);
            this.snack.open(`${opened} — ส่งเข้าคิวแอดมิน「รอรับ」แล้ว`, 'ปิด', { duration: 5000 });
            this.ref.close(true);
          },
          error: (err: Error) => {
            this.saving.set(false);
            this.snack.open(
              `${opened} แต่ยังส่งให้แอดมินไม่สำเร็จ: ${err.message} — กดส่งได้จากคิวซัพพอร์ต`,
              'ปิด',
              { duration: 7000 }
            );
            this.ref.close(true);
          },
        });
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
    const p = ticket?.project;
    return p ? { ...projectPickerOption(p), label: p.name, code: null } : null;
  }

  private customerOptionFrom(ticket: Ticket | null): PickerOption | null {
    if (!ticket?.customer) {
      return null;
    }
    return { id: ticket.customer.id, label: ticket.customer.name };
  }
}
