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
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
import { MaQuotaStatus } from '../../core/models/ma.model';
import {
  EntityPickerComponent,
  PickerOption,
  searchViaBackend,
} from '../../shared/components/entity-picker.component';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

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
  readonly priorities = Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[];

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly showAdvanced = signal(false);

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

  readonly form = this.fb.group({
    title: [this.ticket?.title ?? '', Validators.required],
    description: [this.ticket?.description ?? '', Validators.required],
    priority: [(this.ticket?.priority ?? 'NORMAL') as TicketPriority],
    reportedChannel: [(this.ticket?.reportedChannel ?? 'PHONE') as ReportedChannel],
    billingType: [(this.ticket?.billingType ?? 'ONE_TIME') as BillingType],
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
    if (this.isEdit) {
      this.showAdvanced.set(true);
    }

    this.form.controls.billingType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.billingSelection.set((value as BillingType) ?? null));

    this.loadBillingEligibility(presetProject?.id ?? null, { preserveCurrent: this.isEdit });
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
      this.maQuota.set(null);
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

  toggleAdvanced(): void {
    this.showAdvanced.update((v) => !v);
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

  private loadBillingEligibility(
    projectId: number | null,
    opts: { preserveCurrent: boolean }
  ): void {
    if (!projectId) {
      this.hasActiveWarranty.set(false);
      this.hasActiveMa.set(false);
      this.maQuota.set(null);
      this.syncBillingSelection(opts);
      return;
    }

    forkJoin({
      warranties: this.warrantiesApi.listByProject(projectId).pipe(catchError(() => of([]))),
      contracts: this.maApi.list({ projectId, limit: 100 }).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ warranties, contracts }) => {
        this.hasActiveWarranty.set(warranties.some((w) => w.isCurrentlyActive));
        const active = contracts.find((c) => c.isCurrentlyActive) ?? null;
        this.hasActiveMa.set(!!active);
        this.syncBillingSelection(opts);
        if (!active) {
          this.maQuota.set(null);
          return;
        }
        this.maApi.getQuota(active.id).subscribe({
          next: (quota) => this.maQuota.set(quota),
          error: () => this.maQuota.set(null),
        });
      },
      error: () => {
        this.hasActiveWarranty.set(false);
        this.hasActiveMa.set(false);
        this.maQuota.set(null);
        this.syncBillingSelection(opts);
      },
    });
  }

  private syncBillingSelection(opts: { preserveCurrent: boolean }): void {
    const eligible = this.eligibleBillingTypes();
    const current = (this.form.getRawValue().billingType as BillingType) ?? null;
    if (current && eligible.includes(current)) {
      this.billingSelection.set(current);
      return;
    }
    if (opts.preserveCurrent && current && this.ticket && current === this.ticket.billingType) {
      this.billingSelection.set(current);
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
      this.error.set('กรอกหัวข้อและรายละเอียดปัญหาก่อนบันทึก');
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
        billingType: (raw.billingType as BillingType) ?? 'ONE_TIME',
        reportedChannel: (raw.reportedChannel as ReportedChannel) ?? 'PHONE',
        reportedAt: combineDateAndTime(raw.reportedDate, raw.reportedTime),
        projectId: this.project()?.id ?? null,
      };
      this.ticketsApi.update(this.ticket.id, update).subscribe({
        next: () => {
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
      billingType: (raw.billingType as BillingType) ?? 'ONE_TIME',
      reportedChannel: (raw.reportedChannel as ReportedChannel) ?? 'PHONE',
      reportedAt: combineDateAndTime(raw.reportedDate, raw.reportedTime),
      // ผู้รับเรื่อง = คนที่กำลังกรอก · ผู้รับผิดชอบปล่อยว่างให้หัวหน้ามอบหมายทีหลัง
      receivedByUserId: this.auth.currentUser()?.id ?? null,
    };

    this.ticketsApi.create(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('เปิดใบแจ้งปัญหาแล้ว', 'ปิด', { duration: 2800 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
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
