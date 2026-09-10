import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
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
import { MatTabsModule } from '@angular/material/tabs';
import {
  CHANNEL_LABELS,
  CUSTOMER_STATUS_LABELS,
  CommunicationChannel,
  CommunicationLog,
  Contact,
  Customer,
  CustomerStatus,
} from '../../core/models/customer.model';
import { CustomerOverview } from '../../core/models/customer-overview.model';
import { PROJECT_STATUS_LABELS, Project } from '../../core/models/project.model';
import { MA_STATUS_LABELS, MaContract } from '../../core/models/ma.model';
import {
  FollowUp,
  followUpDisplayStatus,
} from '../../core/models/follow-up.model';
import { CustomerLifetimeValue, formatCompleteness } from '../../core/models/report.model';
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS, Ticket } from '../../core/models/ticket.model';
import {
  WARRANTY_STATUS_LABELS,
  Warranty,
} from '../../core/models/warranty.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { TicketService } from '../../core/services/ticket.service';
import { WarrantyService } from '../../core/services/warranty.service';
import {
  combineDateAndTime,
  nowTimeString,
  toTimeString,
} from '../../core/utils/date.util';
import { navigateBack } from '../../core/utils/navigation.util';
import { sanitizePhoneDigits, thaiPhoneValidator } from '../../core/utils/phone.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { PhoneInputDirective } from '../../shared/directives/phone-input.directive';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

@Component({
  selector: 'app-customer-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatSnackBarModule,
    MatTableModule,
    MatDialogModule,
    TablePaginatorComponent,
  ],
  templateUrl: './customer-detail-page.component.html',
  styleUrl: './customer-detail-page.component.scss',
})
export class CustomerDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly ticketsApi = inject(TicketService);
  private readonly warrantiesApi = inject(WarrantyService);
  private readonly maApi = inject(MaService);
  private readonly followUpsApi = inject(FollowUpService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly customer = signal<Customer | null>(null);
  readonly overview = signal<CustomerOverview | null>(null);
  readonly contacts = signal<Contact[]>([]);
  readonly logs = signal<CommunicationLog[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly tickets = signal<Ticket[]>([]);
  readonly warranties = signal<Warranty[]>([]);
  readonly contracts = signal<MaContract[]>([]);
  readonly followUps = signal<FollowUp[]>([]);
  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly channelLabels = CHANNEL_LABELS;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly ticketPriorityLabels = TICKET_PRIORITY_LABELS;
  readonly warrantyStatusLabels = WARRANTY_STATUS_LABELS;
  readonly maStatusLabels = MA_STATUS_LABELS;
  readonly notFound = signal(false);
  readonly selectedTab = signal(0);

  readonly contactSearch = signal('');
  readonly logSearch = signal('');
  readonly projectSearch = signal('');
  readonly warrantySearch = signal('');
  readonly maSearch = signal('');
  readonly ticketSearch = signal('');
  readonly followUpSearch = signal('');

  readonly contactSearchControl = this.fb.nonNullable.control('');
  readonly logSearchControl = this.fb.nonNullable.control('');
  readonly projectSearchControl = this.fb.nonNullable.control('');
  readonly warrantySearchControl = this.fb.nonNullable.control('');
  readonly maSearchControl = this.fb.nonNullable.control('');
  readonly ticketSearchControl = this.fb.nonNullable.control('');
  readonly followUpSearchControl = this.fb.nonNullable.control('');

  readonly contactColumns = [
    'name',
    'nickname',
    'position',
    'phone',
    'email',
    'lineId',
    'isPrimary',
    'actions',
  ];
  readonly logColumns = ['occurredAt', 'channel', 'subject', 'contact', 'handler', 'actions'];
  readonly projectColumns = ['name', 'status', 'targetEndDate', 'actions'];
  readonly warrantyColumns = ['title', 'duration', 'status', 'endDate', 'actions'];
  readonly maColumns = ['id', 'plan', 'status', 'quota', 'actions'];
  readonly ticketColumns = ['title', 'status', 'priority', 'actions'];
  readonly followUpColumns = ['title', 'status', 'dueDate', 'actions'];

  readonly filteredContacts = computed(() => {
    const q = this.contactSearch().trim().toLowerCase();
    const list = this.contacts();
    if (!q) {
      return list;
    }
    return list.filter((c) =>
      [c.name, c.nickname, c.position, c.phone, c.email, c.lineId, c.note]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredLogs = computed(() => {
    const q = this.logSearch().trim().toLowerCase();
    const list = this.logs();
    if (!q) {
      return list;
    }
    return list.filter((log) =>
      [
        this.channelLabels[log.channel],
        log.subject,
        log.content,
        log.contactName,
        log.handledBy?.fullName,
        log.occurredAt,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredProjects = computed(() => {
    const q = this.projectSearch().trim().toLowerCase();
    const list = this.projects();
    if (!q) {
      return list;
    }
    return list.filter((p) =>
      [p.name, this.projectStatusLabels[p.status], p.targetEndDate]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredWarranties = computed(() => {
    const q = this.warrantySearch().trim().toLowerCase();
    const list = this.warranties();
    if (!q) {
      return list;
    }
    return list.filter((w) =>
      [
        w.delivery?.title,
        w.project?.name,
        String(w.durationMonth),
        this.warrantyStatusLabels[w.status],
        w.endDate,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredContracts = computed(() => {
    const q = this.maSearch().trim().toLowerCase();
    const list = this.contracts();
    if (!q) {
      return list;
    }
    return list.filter((m) =>
      [
        String(m.id),
        m.plan?.name,
        String(m.planId),
        this.maStatusLabels[m.status],
        String(this.remainingQuota(m)),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredTickets = computed(() => {
    const q = this.ticketSearch().trim().toLowerCase();
    const list = this.tickets();
    if (!q) {
      return list;
    }
    return list.filter((t) =>
      [
        String(t.id),
        t.ticketNo,
        t.title,
        this.ticketStatusLabels[t.status],
        this.ticketPriorityLabels[t.priority],
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredFollowUps = computed(() => {
    const q = this.followUpSearch().trim().toLowerCase();
    const list = this.followUps();
    if (!q) {
      return list;
    }
    return list.filter((f) =>
      [f.title, followUpDisplayStatus(f), f.dueDate, f.detail]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly contactsPager = createClientPager(this.filteredContacts);
  readonly logsPager = createClientPager(this.filteredLogs);
  readonly projectsPager = createClientPager(this.filteredProjects);
  readonly warrantiesPager = createClientPager(this.filteredWarranties);
  readonly contractsPager = createClientPager(this.filteredContracts);
  readonly ticketsPager = createClientPager(this.filteredTickets);
  readonly followUpsPager = createClientPager(this.filteredFollowUps);

  private static readonly TAB_KEYS = [
    'contacts',
    'logs',
    'projects',
    'contracts',
    'tickets',
    'follow-ups',
  ] as const;

  private customerId = 0;

  statusLabel(status: Customer['status'] | string): string {
    return this.statusLabels[status as CustomerStatus] ?? String(status);
  }

  channelLabel(channel: CommunicationChannel): string {
    return this.channelLabels[channel];
  }

  projectStatusLabel(status: Project['status']): string {
    return this.projectStatusLabels[status];
  }

  ticketStatusLabel(status: Ticket['status']): string {
    return this.ticketStatusLabels[status];
  }

  ticketPriorityLabel(priority: Ticket['priority']): string {
    return this.ticketPriorityLabels[priority];
  }

  goBack(): void {
    navigateBack(this.location, this.router, '/app/customers');
  }

  onTabChange(index: number): void {
    this.selectedTab.set(index);
    const tab = CustomerDetailPageComponent.TAB_KEYS[index];
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.customerId = id;
    const tabKey = this.route.snapshot.queryParamMap.get('tab');
    const tabIndex = CustomerDetailPageComponent.TAB_KEYS.findIndex((key) => key === tabKey);
    if (tabIndex >= 0) {
      this.selectedTab.set(tabIndex);
    } else {
      this.selectedTab.set(0);
    }
    this.contactSearchControl.valueChanges.subscribe((v) => this.contactSearch.set(v));
    this.logSearchControl.valueChanges.subscribe((v) => this.logSearch.set(v));
    this.projectSearchControl.valueChanges.subscribe((v) => this.projectSearch.set(v));
    this.warrantySearchControl.valueChanges.subscribe((v) => this.warrantySearch.set(v));
    this.maSearchControl.valueChanges.subscribe((v) => this.maSearch.set(v));
    this.ticketSearchControl.valueChanges.subscribe((v) => this.ticketSearch.set(v));
    this.followUpSearchControl.valueChanges.subscribe((v) => this.followUpSearch.set(v));
    this.api.fetchCustomer(id).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.notFound.set(false);
        this.refreshChildren();
      },
      error: () => this.notFound.set(true),
    });
    this.api.getOverview(id).subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.overview.set(null),
    });
  }

  lifetimeValue(): CustomerLifetimeValue | null {
    return this.overview()?.lifetimeValue ?? null;
  }

  hasExcludedLifetime(lv: CustomerLifetimeValue): boolean {
    return (Number(lv.excludedCancelledValue) || 0) > 0 || (lv.excludedCancelledCount ?? 0) > 0;
  }

  oneTimeCompletenessLabel(lv: CustomerLifetimeValue): string {
    return formatCompleteness(lv.oneTimeCompleteness);
  }

  lastContactedAt(c: Customer): string | null {
    return this.overview()?.lastContactedAt ?? c.lastContactedAt ?? null;
  }

  idleDays(c: Customer): number | null {
    const fromOverview = this.overview()?.idleDays;
    if (fromOverview != null) {
      return fromOverview;
    }
    return c.daysSinceLastContact ?? null;
  }

  refreshChildren(): void {
    this.api.listContacts(this.customerId).subscribe({
      next: (rows) => this.contacts.set(rows),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
    this.api.listLogs(this.customerId).subscribe({
      next: (rows) => this.logs.set(rows),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
    this.projectsApi.listProjects().subscribe({
      next: () => {
        this.projects.set(this.projectsApi.getProjectsByCustomer(this.customerId));
        this.warrantiesApi
          .listExpiring({ customerId: this.customerId, days: 365, limit: 100 })
          .subscribe({
            next: (rows) => this.warranties.set(rows),
            error: () => this.warranties.set([]),
          });
      },
    });
    this.ticketsApi.list({ customerId: this.customerId }).subscribe({
      next: (rows) => this.tickets.set(rows),
      error: () => this.tickets.set([]),
    });
    this.maApi.list({ customerId: this.customerId }).subscribe({
      next: (rows) => this.contracts.set(rows),
      error: () => this.contracts.set(this.maApi.getByCustomer(this.customerId)),
    });
    this.followUpsApi.list({ customerId: this.customerId }).subscribe({
      next: (rows) => this.followUps.set(rows),
      error: () => this.followUps.set(this.followUpsApi.getByCustomer(this.customerId)),
    });
  }

  remainingQuota(c: MaContract): number {
    return this.maApi.remainingQuota(c);
  }

  isFollowUpOverdue(f: FollowUp): boolean {
    return this.followUpsApi.isOverdue(f);
  }

  followUpStatusLabel(f: FollowUp): string {
    return followUpDisplayStatus(f);
  }

  warrantyStatusLabel(status: Warranty['status']): string {
    return this.warrantyStatusLabels[status];
  }

  maStatusLabel(status: MaContract['status']): string {
    return this.maStatusLabels[status];
  }

  openContactForm(contact?: Contact): void {
    const ref = this.dialog.open(CustomerContactFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { customerId: this.customerId, contact: contact ?? null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refreshChildren();
      }
    });
  }

  openContactDetail(contact: Contact): void {
    openConfirmDialog(this.dialog, {
      title: contact.name,
      message: [
        `ชื่อเล่น: ${contact.nickname || '—'}`,
        `ตำแหน่ง: ${contact.position || '—'}`,
        `โทรศัพท์: ${contact.phone || '—'}`,
        `อีเมล: ${contact.email || '—'}`,
        `LINE ID: ${contact.lineId || '—'}`,
        `ผู้ติดต่อหลัก: ${contact.isPrimary ? 'ใช่' : 'ไม่'}`,
        `หมายเหตุ: ${contact.note || '—'}`,
      ].join('\n'),
      confirmLabel: 'ปิด',
      hideCancel: true,
    }).subscribe();
  }

  removeContact(contact: Contact): void {
    openConfirmDialog(this.dialog, {
      title: 'ลบผู้ติดต่อ',
      message: `ต้องการลบผู้ติดต่อ「${contact.name}」หรือไม่?`,
      confirmLabel: 'ลบผู้ติดต่อ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.removeContact(contact.id).subscribe({
        next: () => {
          this.snack.open('ลบผู้ติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }

  openLogForm(log?: CommunicationLog): void {
    const ref = this.dialog.open(CustomerLogFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: {
        customerId: this.customerId,
        contacts: this.contacts(),
        log: log ?? null,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refreshChildren();
      }
    });
  }

  openLogDetail(log: CommunicationLog): void {
    openConfirmDialog(this.dialog, {
      title: log.subject?.trim() || this.channelLabels[log.channel],
      message: [
        `ช่องทาง: ${this.channelLabels[log.channel]}`,
        `วันเวลา: ${log.occurredAt}`,
        `ผู้ติดต่อ: ${log.contactName || '—'}`,
        `โดย: ${log.handledBy?.fullName || '—'}`,
        '',
        log.content || '—',
      ].join('\n'),
      confirmLabel: 'ปิด',
      hideCancel: true,
    }).subscribe();
  }

  removeLog(log: CommunicationLog): void {
    const label = log.subject?.trim() || this.channelLabels[log.channel];
    openConfirmDialog(this.dialog, {
      title: 'ลบประวัติการติดต่อ',
      message: `ต้องการลบ「${label}」หรือไม่?`,
      confirmLabel: 'ลบประวัติ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.removeLog(log.id).subscribe({
        next: () => {
          this.snack.open('ลบประวัติการติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }

  openProjectDetail(project: Project): void {
    void this.router.navigate(['/app/projects', project.id]);
  }

  openWarrantyDetail(warranty: Warranty): void {
    void this.router.navigate(['/app/warranties'], {
      queryParams: { highlight: warranty.id },
    });
  }

  openMaDetail(contract: MaContract): void {
    void this.router.navigate(['/app/ma', contract.id]);
  }

  openTicketDetail(ticket: Ticket): void {
    void this.router.navigate(['/app/tickets', ticket.id]);
  }

  openFollowUpDetail(followUp: FollowUp): void {
    void this.router.navigate(['/app/follow-ups'], {
      queryParams: { highlight: followUp.id },
    });
  }
}

/* ——— Contact form dialog ——— */

@Component({
  selector: 'app-customer-contact-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatSnackBarModule,
    PhoneInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.contact ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="customer-contact-form" (ngSubmit)="save()">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ชื่อ-นามสกุล</mat-label>
            <input matInput formControlName="name" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ชื่อเล่น</mat-label>
            <input matInput formControlName="nickname" />
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ตำแหน่ง</mat-label>
            <input matInput formControlName="position" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>โทรศัพท์</mat-label>
            <input
              matInput
              appPhoneInput
              formControlName="phone"
              type="tel"
              inputmode="numeric"
              maxlength="10"
            />
            @if (form.controls.phone.hasError('thaiPhone')) {
              <mat-error>เบอร์ต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก</mat-error>
            }
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>อีเมล</mat-label>
            <input matInput formControlName="email" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>LINE ID</mat-label>
            <input matInput formControlName="lineId" />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
        <mat-checkbox formControlName="isPrimary">ตั้งเป็นผู้ติดต่อหลัก</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="customer-contact-form">
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(480px, 80vw);
      padding-top: 0.25rem;
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
export class CustomerContactFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<CustomerContactFormDialogComponent, boolean>);
  readonly data = inject<{ customerId: number; contact: Contact | null }>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.contact?.name ?? '', Validators.required],
    nickname: [this.data.contact?.nickname ?? ''],
    position: [this.data.contact?.position ?? ''],
    phone: [sanitizePhoneDigits(this.data.contact?.phone ?? ''), thaiPhoneValidator],
    email: [this.data.contact?.email ?? ''],
    lineId: [this.data.contact?.lineId ?? ''],
    isPrimary: [this.data.contact?.isPrimary ?? false],
    note: [this.data.contact?.note ?? ''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.api
      .saveContact(
        this.data.customerId,
        {
          name: raw.name.trim(),
          nickname: raw.nickname.trim() || undefined,
          position: raw.position.trim() || undefined,
          phone: raw.phone.trim() ? sanitizePhoneDigits(raw.phone) : undefined,
          email: raw.email.trim() || undefined,
          lineId: raw.lineId.trim() || undefined,
          isPrimary: raw.isPrimary,
          note: raw.note.trim() || undefined,
        },
        this.data.contact?.id
      )
      .subscribe({
        next: () => {
          this.snack.open(
            this.data.contact ? 'อัปเดตผู้ติดต่อแล้ว' : 'บันทึกผู้ติดต่อแล้ว',
            'ปิด',
            { duration: 2500 }
          );
          this.ref.close(true);
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }
}

/* ——— Communication log form dialog ——— */

@Component({
  selector: 'app-customer-log-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    MatDatepickerModule,
    ThaiTimeInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.log ? 'แก้ไขประวัติการติดต่อ' : 'บันทึกการติดต่อ' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="customer-log-form" (ngSubmit)="save()">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ช่องทาง</mat-label>
            <mat-select formControlName="channel">
              @for (ch of channels; track ch) {
                <mat-option [value]="ch">{{ channelLabels[ch] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>วันที่ติดต่อ</mat-label>
            <input
              matInput
              [matDatepicker]="logPicker"
              formControlName="occurredDate"
              readonly
              (click)="logPicker.open()"
            />
            <mat-datepicker-toggle matIconSuffix [for]="logPicker"></mat-datepicker-toggle>
            <mat-datepicker #logPicker></mat-datepicker>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>เวลาที่ติดต่อ</mat-label>
            <input matInput appThaiTimeInput formControlName="occurredTime" />
            <span matTextSuffix>น.</span>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ผู้ติดต่อ</mat-label>
            <mat-select formControlName="contactId">
              <mat-option [value]="null">—</mat-option>
              @for (contact of data.contacts; track contact.id) {
                <mat-option [value]="contact.id">{{ contact.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หัวข้อ</mat-label>
          <input matInput formControlName="subject" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>สรุปการคุย</mat-label>
          <textarea matInput rows="3" formControlName="content"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="customer-log-form">
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(480px, 80vw);
      padding-top: 0.25rem;
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
export class CustomerLogFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<CustomerLogFormDialogComponent, boolean>);
  readonly data = inject<{
    customerId: number;
    contacts: Contact[];
    log: CommunicationLog | null;
  }>(MAT_DIALOG_DATA);

  readonly channelLabels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];

  readonly form = this.fb.nonNullable.group({
    channel: [
      (this.data.log?.channel ?? 'LINE') as CommunicationChannel,
      Validators.required,
    ],
    contactId: [this.data.log?.contactId ?? (null as number | null)],
    subject: [this.data.log?.subject ?? ''],
    content: [this.data.log?.content ?? '', Validators.required],
    occurredDate: [
      (this.data.log
        ? new Date(this.data.log.occurredAt)
        : new Date()) as Date | null,
      Validators.required,
    ],
    occurredTime: [
      this.data.log ? toTimeString(this.data.log.occurredAt) : nowTimeString(),
      Validators.required,
    ],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload = {
      channel: raw.channel,
      occurredAt: combineDateAndTime(raw.occurredDate, raw.occurredTime),
      contactId: raw.contactId ?? undefined,
      subject: raw.subject.trim() || undefined,
      content: raw.content.trim() || undefined,
      handledByUserId: this.auth.currentUser()?.id,
    };
    const req$ = this.data.log
      ? this.api.updateLog(this.data.log.id, payload)
      : this.api.addLog(this.data.customerId, payload);

    req$.subscribe({
      next: () => {
        this.snack.open(
          this.data.log ? 'อัปเดตประวัติการติดต่อแล้ว' : 'บันทึกประวัติการติดต่อแล้ว',
          'ปิด',
          { duration: 2500 }
        );
        this.ref.close(true);
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }
}
