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
import { forkJoin } from 'rxjs';
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
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import {
  TICKET_CATEGORY_DEMO_LABELS,
  TicketCategoryDemo,
  TicketDemoOverlayService,
} from '../../core/services/ticket-demo-overlay.service';
import {
  TicketCreateInput,
  TicketService,
  TicketUpdateInput,
} from '../../core/services/ticket.service';
import { WarrantyService } from '../../core/services/warranty.service';
import {
  combineDateAndTime,
  nowTimeString,
  parseDateOnly,
  toTimeString,
} from '../../core/utils/date.util';
import { MaContract, MaPlan, MaPlanItem, MaQuotaStatus } from '../../core/models/ma.model';
import { Warranty } from '../../core/models/warranty.model';
import {
  EntityPickerComponent,
  PickerOption,
  searchViaBackend,
} from '../../shared/components/entity-picker.component';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { swallowHttpError, warnHttpError } from '../../shared/utils/swallow-http-error';
import { parseMoneyValue } from '../../core/utils/money.util';

const BILLING_TYPE_ORDER: BillingType[] = [
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
  /** ล็อกโปรเจคไว้ล่วงหน้า (เปิดจากหน้าโปรเจค) */
  project?: PickerOption | null;
}

/**
 * เปิดใบแจ้งปัญหา
 *
 * พนักงานแค่ "รับเรื่อง" — ไม่ต้องเลือกผู้รับผิดชอบ
 * (การโยนงานให้ใครเป็นเรื่องของหัวหน้า ทำที่หน้ารายละเอียดใบ)
 *
 * ช่องบังคับมีแค่: โปรเจคหรือลูกค้า · หัวข้อ · รายละเอียด · ช่องทาง · ความเร่งด่วน
 * ที่เหลือพับไว้ใน "ตัวเลือกเพิ่มเติม"
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
  private readonly warrantiesApi = inject(WarrantyService);
  private readonly maApi = inject(MaService);
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

  readonly channelLabels = REPORTED_CHANNEL_LABELS;
  readonly channels = Object.keys(REPORTED_CHANNEL_LABELS) as ReportedChannel[];
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;
  /** เรียงจากเร่งด่วนมาก → ต่ำ ตามความสำคัญตอนเลือก */
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

  /** ลูกค้า/โปรเจคที่เลือกอยู่ — โปรเจคเป็นตัวเติมลูกค้าให้ */
  readonly customer = signal<PickerOption | null>(null);
  readonly project = signal<PickerOption | null>(null);
  /** true เมื่อลูกค้าถูกเติมจากโปรเจค — ห้ามแก้มือ */
  readonly customerFromProject = signal(false);

  readonly hasActiveWarranty = signal(false);
  readonly hasActiveMa = signal(false);
  /** โควตา MA ของโปรเจคที่เลือก — ไม่มีสัญญา = null (ห้ามโชว์เป็น 0) */
  readonly maQuota = signal<MaQuotaStatus | null>(null);
  readonly billingSelection = signal<BillingType | null>(null);

  /** ประกันที่ใช้งานของโปรเจค — ใช้โชว์ขอบเขต */
  readonly activeWarranty = signal<Warranty | null>(null);
  /** สัญญา MA ที่ใช้งาน — ใช้โชว์แผน/บริการย่อย */
  readonly activeMaContract = signal<MaContract | null>(null);
  readonly maPlan = signal<MaPlan | null>(null);
  readonly maPlanLoading = signal(false);
  readonly maPlanError = signal<string | null>(null);
  /** ขยาย overview เมื่อยังไม่เลือกประเภทคิดเงิน */
  readonly scopeOverviewOpen = signal(false);

  readonly availableBillingTypes = computed(() => {
    const types = this.eligibleBillingTypes();
    const current = this.billingSelection();
    if (current && !types.includes(current)) {
      return sortBillingTypes([...types, current]);
    }
    return types;
  });

  readonly billingHint = computed(() => {
    const current = this.billingSelection();
    if (!this.project()) {
      return 'เลือกโปรเจคก่อนจึงจะเลือก「ในประกัน」หรือ「ใช้โควตา MA / Add-on」ได้';
    }
    if (current === 'WARRANTY' && !this.hasActiveWarranty()) {
      return 'ไม่มีประกันใช้งานของโปรเจคนี้แล้ว — ควรเปลี่ยนประเภท';
    }
    if ((current === 'MA_QUOTA' || current === 'ADDON') && !this.hasActiveMa()) {
      return 'ไม่มีสัญญา MA สถานะใช้งาน (ต้องไม่ใช่แบบร่าง) — ควรเปลี่ยนประเภท';
    }
    return null;
  });

  /**
   * แผงช่วยดูขอบเขต — advisory เท่านั้น
   * WARRANTY → ประกัน · MA_QUOTA/ADDON → รายการแผน · ยังไม่เลือก → overview ย่อได้
   */
  readonly scopePanelMode = computed((): 'warranty' | 'ma' | 'overview' | null => {
    const billing = this.billingSelection();
    const hasW = !!this.activeWarranty();
    const hasM = !!this.activeMaContract();
    if (billing === 'WARRANTY') {
      return hasW ? 'warranty' : null;
    }
    if (billing === 'MA_QUOTA' || billing === 'ADDON') {
      return hasM ? 'ma' : null;
    }
    if (!billing && (hasW || hasM)) {
      return 'overview';
    }
    return null;
  });

  readonly maPlanItems = computed((): MaPlanItem[] => {
    const items = this.maPlan()?.items ?? [];
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  });

  readonly form = this.fb.group({
    title: [this.ticket?.title ?? '', Validators.required],
    description: [this.ticket?.description ?? '', Validators.required],
    priority: [(this.ticket?.priority ?? 'NORMAL') as TicketPriority],
    reportedChannel: [(this.ticket?.reportedChannel ?? 'PHONE') as ReportedChannel],
    /** ตัวอย่าง FE เท่านั้น — ไม่ส่งขึ้น API */
    category: [
      (this.ticket
        ? (this.demoOverlay.snapshot(this.ticket.id).category ?? null)
        : null) as TicketCategoryDemo | null,
    ],
    /** ระบุเมื่อหมวด = อื่น ๆ — ตัวอย่าง FE */
    categoryOtherNote: [
      this.ticket
        ? (this.demoOverlay.snapshot(this.ticket.id).categoryOtherNote ?? '')
        : '',
    ],
    billingType: [
      (this.ticket?.billingType ?? null) as BillingType | null,
      Validators.required,
    ],
    /** ตัวอย่าง FE — ค่าบริการเป็นครั้ง (ยังไม่ส่ง Create/Update API) */
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
    this.billingSelection.set((this.ticket?.billingType ?? null) as BillingType | null);

    // เติมค่าเริ่มต้นจาก preset / ใบเดิม
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

    this.loadBillingEligibility(presetProject?.id ?? null, { preserveCurrent: this.isEdit });
  }

  private syncCategoryOtherValidators(category: TicketCategoryDemo | null): void {
    const ctrl = this.form.controls.categoryOtherNote;
    if (category === 'OTHER') {
      ctrl.setValidators([Validators.required, Validators.maxLength(80)]);
    } else {
      ctrl.clearValidators();
      ctrl.setValue('', { emitEvent: false });
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  /* ——— ค้นหา ——— */

  readonly searchProjects = (query: string) =>
    searchViaBackend(
      (params) => this.projectsApi.listProjects(params),
      (p): PickerOption => ({
        id: p.id,
        label: p.name,
        code: p.code,
        meta: [p.code ?? '—', p.customer?.name].filter(Boolean).join(' · '),
      }),
      query
    );

  readonly searchCustomers = (query: string) =>
    searchViaBackend(
      (params) => this.customersApi.listCustomers(params),
      (c): PickerOption => ({
        id: c.id,
        label: c.name,
        code: c.code,
        meta: [c.code ?? '—', c.phone].filter(Boolean).join(' · '),
      }),
      query
    );

  /** เลือกโปรเจค → เติมลูกค้าให้อัตโนมัติ */
  onProjectPicked(option: PickerOption | null): void {
    this.project.set(option);
    this.error.set(null);

    if (!option) {
      if (this.customerFromProject()) {
        this.customer.set(null);
        this.customerFromProject.set(false);
      }
      this.loadBillingEligibility(null, { preserveCurrent: false });
      return;
    }

    this.projectsApi.fetchProject(option.id).subscribe({
      next: (project) => {
        if (project.customer) {
          this.customer.set({
            id: project.customer.id,
            label: project.customer.name,
            meta: 'เติมจากโปรเจคที่เลือก',
          });
          this.customerFromProject.set(true);
        }
      },
      error: () => undefined,
    });

    this.loadBillingEligibility(option.id, { preserveCurrent: false });
  }

  onCustomerPicked(option: PickerOption | null): void {
    this.customer.set(option);
    this.customerFromProject.set(false);
    this.error.set(null);
  }

  clearCustomerLock(): void {
    this.customer.set(null);
    this.customerFromProject.set(false);
    this.project.set(null);
    this.loadBillingEligibility(null, { preserveCurrent: false });
  }

  toggleScopeOverview(): void {
    this.scopeOverviewOpen.update((open) => !open);
  }

  maPlanDisplayName(contract: MaContract | null = this.activeMaContract()): string {
    return this.maPlan()?.name?.trim() || contract?.plan?.name?.trim() || '';
  }

  /* ——— ประเภทการคิดค่าใช้จ่าย ——— */

  private eligibleBillingTypes(): BillingType[] {
    const types: BillingType[] = [];
    if (this.hasActiveWarranty()) {
      types.push('WARRANTY');
    }
    if (this.hasActiveMa()) {
      types.push('MA_QUOTA', 'ADDON');
    }
    types.push('ONE_TIME', 'FREE');
    return types;
  }

  private clearScopeState(): void {
    this.hasActiveWarranty.set(false);
    this.hasActiveMa.set(false);
    this.maQuota.set(null);
    this.activeWarranty.set(null);
    this.activeMaContract.set(null);
    this.maPlan.set(null);
    this.maPlanLoading.set(false);
    this.maPlanError.set(null);
    this.scopeOverviewOpen.set(false);
  }

  private loadBillingEligibility(
    projectId: number | null,
    opts: { preserveCurrent: boolean }
  ): void {
    if (!projectId) {
      this.clearScopeState();
      this.syncBillingSelection(opts);
      return;
    }

    forkJoin({
      warranties: this.warrantiesApi
        .listByProject(projectId)
        .pipe(swallowHttpError([] as Warranty[], 'ticket-form warranties')),
      contracts: this.maApi
        .list({ projectId, limit: 100 })
        .pipe(swallowHttpError([] as MaContract[], 'ticket-form ma-contracts')),
    }).subscribe({
      next: ({ warranties, contracts }) => {
        const warranty = warranties.find((w) => w.isCurrentlyActive) ?? null;
        this.activeWarranty.set(warranty);
        this.hasActiveWarranty.set(!!warranty);

        const active = contracts.find((c) => c.isCurrentlyActive) ?? null;
        this.activeMaContract.set(active);
        this.hasActiveMa.set(!!active);
        this.syncBillingSelection(opts);

        if (!active) {
          this.maQuota.set(null);
          this.maPlan.set(null);
          this.maPlanLoading.set(false);
          this.maPlanError.set(null);
          return;
        }

        this.maApi.getQuota(active.id).subscribe({
          next: (quota) => this.maQuota.set(quota),
          error: (err) => {
            warnHttpError(err, 'ticket-form ma-quota');
            this.maQuota.set(null);
          },
        });

        const planId = active.planId ?? active.plan?.id ?? null;
        if (planId == null) {
          this.maPlan.set(null);
          this.maPlanError.set('สัญญา MA นี้ยังไม่มีแผนผูกไว้');
          return;
        }
        this.maPlanLoading.set(true);
        this.maPlanError.set(null);
        this.maApi.getPlanById(planId).subscribe({
          next: (plan) => {
            this.maPlan.set(plan);
            this.maPlanLoading.set(false);
          },
          error: (err: Error) => {
            warnHttpError(err, 'ticket-form ma-plan');
            this.maPlan.set(null);
            this.maPlanLoading.set(false);
            this.maPlanError.set(err.message || 'โหลดรายการบริการในแผนไม่สำเร็จ');
          },
        });
      },
      error: (err) => {
        warnHttpError(err, 'ticket-form billing-eligibility');
        this.clearScopeState();
        this.syncBillingSelection(opts);
      },
    });
  }

  private syncBillingSelection(opts: { preserveCurrent: boolean }): void {
    const eligible = this.eligibleBillingTypes();
    const current = (this.form.getRawValue().billingType as BillingType | null) ?? null;
    if (current && eligible.includes(current)) {
      this.billingSelection.set(current);
      return;
    }
    if (opts.preserveCurrent && current && this.ticket && current === this.ticket.billingType) {
      this.billingSelection.set(current);
      return;
    }
    // สร้างใหม่ — ไม่เดาค่าให้ ต้องเลือกเอง
    if (!this.isEdit) {
      if (current && !eligible.includes(current)) {
        this.form.patchValue({ billingType: null }, { emitEvent: false });
        this.billingSelection.set(null);
      }
      return;
    }
    const next = eligible.includes('WARRANTY')
      ? 'WARRANTY'
      : eligible.includes('MA_QUOTA')
        ? 'MA_QUOTA'
        : 'ONE_TIME';
    this.form.patchValue({ billingType: next }, { emitEvent: false });
    this.billingSelection.set(next);
  }

  /* ——— บันทึก ——— */

  save(): void {
    const customerId = this.customer()?.id ?? null;
    if (customerId == null) {
      this.error.set('เลือกโปรเจค หรือเลือกลูกค้าก่อนเปิดใบ');
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
      // PATCH /tickets/:id ไม่รับ customerId / status / assignedUserId
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
          this.persistDemoCategory(
            this.ticket!.id,
            raw.category as TicketCategoryDemo | null,
            raw.categoryOtherNote
          );
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
      // ผู้รับเรื่อง = คนที่กำลังกรอก · ผู้รับผิดชอบปล่อยว่างให้หัวหน้ามอบหมายทีหลัง
      receivedByUserId: this.auth.currentUser()?.id ?? null,
    };

    this.ticketsApi.create(payload).subscribe({
      next: (created) => {
        this.persistDemoCategory(
          created.id,
          raw.category as TicketCategoryDemo | null,
          raw.categoryOtherNote
        );
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
    if (!ticket?.project) {
      return null;
    }
    return { id: ticket.project.id, label: ticket.project.name };
  }

  private customerOptionFrom(ticket: Ticket | null): PickerOption | null {
    if (!ticket?.customer) {
      return null;
    }
    return { id: ticket.customer.id, label: ticket.customer.name };
  }
}

function sortBillingTypes(types: BillingType[]): BillingType[] {
  return [...types].sort(
    (a, b) => BILLING_TYPE_ORDER.indexOf(a) - BILLING_TYPE_ORDER.indexOf(b)
  );
}
