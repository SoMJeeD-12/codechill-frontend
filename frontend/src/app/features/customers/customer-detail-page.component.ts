import { Location } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import {
  CHANNEL_LABELS,
  CUSTOMER_STATUS_LABELS,
  CommunicationChannel,
  CommunicationLog,
  Contact,
  Customer,
} from '../../core/models/customer.model';
import { PROJECT_STATUS_LABELS, Project } from '../../core/models/project.model';
import { MA_STATUS_LABELS, MaContract } from '../../core/models/ma.model';
import {
  FOLLOW_UP_STATUS_LABELS,
  FollowUp,
  followUpDisplayStatus,
} from '../../core/models/follow-up.model';
import { TICKET_STATUS_LABELS, Ticket } from '../../core/models/ticket.model';
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
import { combineDateAndTime, nowTimeString, toTimeString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { navigateBack } from '../../core/utils/navigation.util';
import { sanitizePhoneDigits, thaiPhoneValidator } from '../../core/utils/phone.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { PhoneInputDirective } from '../../shared/directives/phone-input.directive';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';

@Component({
  selector: 'app-customer-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    ThaiTimeInputDirective,
    PhoneInputDirective,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatDialogModule,
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
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly customer = signal<Customer | null>(null);
  readonly contacts = signal<Contact[]>([]);
  readonly logs = signal<CommunicationLog[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly tickets = signal<Ticket[]>([]);
  readonly warranties = signal<Warranty[]>([]);
  readonly contracts = signal<MaContract[]>([]);
  readonly followUps = signal<FollowUp[]>([]);
  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly channelLabels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly warrantyStatusLabels = WARRANTY_STATUS_LABELS;
  readonly maStatusLabels = MA_STATUS_LABELS;
  readonly followUpStatusLabels = FOLLOW_UP_STATUS_LABELS;
  readonly notFound = signal(false);
  readonly editingContactId = signal<number | null>(null);
  readonly editingLogId = signal<number | null>(null);
  readonly selectedTab = signal(0);

  private static readonly TAB_KEYS = [
    'contacts',
    'logs',
    'projects',
    'contracts',
    'tickets',
    'follow-ups',
  ] as const;

  statusLabel(status: Customer['status']): string {
    return this.statusLabels[status];
  }

  readonly contactForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    nickname: [''],
    position: [''],
    phone: ['', thaiPhoneValidator],
    email: [''],
    lineId: [''],
    isPrimary: [false],
    note: [''],
  });

  readonly logForm = this.fb.nonNullable.group({
    channel: ['LINE' as CommunicationChannel, Validators.required],
    contactId: [null as number | null],
    subject: [''],
    content: ['', Validators.required],
    occurredDate: [new Date() as Date | null, Validators.required],
    occurredTime: [nowTimeString(), Validators.required],
  });

  private customerId = 0;

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
    }
    this.api.fetchCustomer(id).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.notFound.set(false);
        this.refreshChildren();
      },
      error: () => this.notFound.set(true),
    });
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
        this.warrantiesApi.listExpiring({ customerId: this.customerId, days: 365, limit: 100 }).subscribe({
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

  startEditContact(contact: Contact): void {
    this.editingContactId.set(contact.id);
    this.contactForm.reset({
      name: contact.name,
      nickname: contact.nickname ?? '',
      position: contact.position ?? '',
      phone: sanitizePhoneDigits(contact.phone),
      email: contact.email ?? '',
      lineId: contact.lineId ?? '',
      isPrimary: contact.isPrimary,
      note: contact.note ?? '',
    });
  }

  cancelEditContact(): void {
    this.editingContactId.set(null);
    this.resetContactForm();
  }

  private resetContactForm(): void {
    this.contactForm.reset({
      name: '',
      nickname: '',
      position: '',
      phone: '',
      email: '',
      lineId: '',
      isPrimary: false,
      note: '',
    });
  }

  saveContact(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }
    const raw = this.contactForm.getRawValue();
    const contactId = this.editingContactId() ?? undefined;
    this.api
      .saveContact(
        this.customerId,
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
        contactId
      )
      .subscribe({
        next: () => {
          this.snack.open(contactId ? 'อัปเดตผู้ติดต่อแล้ว' : 'บันทึกผู้ติดต่อแล้ว', 'ปิด', {
            duration: 2500,
          });
          this.editingContactId.set(null);
          this.resetContactForm();
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
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
          if (this.editingContactId() === contact.id) {
            this.cancelEditContact();
          }
          this.snack.open('ลบผู้ติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }

  startEditLog(log: CommunicationLog): void {
    this.editingLogId.set(log.id);
    const occurred = new Date(log.occurredAt);
    this.logForm.reset({
      channel: log.channel,
      contactId: log.contactId,
      subject: log.subject ?? '',
      content: log.content ?? '',
      occurredDate: Number.isNaN(occurred.getTime()) ? new Date() : occurred,
      occurredTime: toTimeString(log.occurredAt),
    });
  }

  cancelEditLog(): void {
    this.editingLogId.set(null);
    this.resetLogForm();
  }

  private resetLogForm(): void {
    this.logForm.reset({
      channel: 'LINE',
      contactId: null,
      subject: '',
      content: '',
      occurredDate: new Date(),
      occurredTime: nowTimeString(),
    });
  }

  saveLog(): void {
    if (this.logForm.invalid) {
      this.logForm.markAllAsTouched();
      return;
    }
    const raw = this.logForm.getRawValue();
    const payload = {
      channel: raw.channel,
      occurredAt: combineDateAndTime(raw.occurredDate, raw.occurredTime),
      contactId: raw.contactId ?? undefined,
      subject: raw.subject.trim() || undefined,
      content: raw.content.trim() || undefined,
      handledByUserId: this.auth.currentUser()?.id,
    };
    const logId = this.editingLogId();
    const req$ = logId
      ? this.api.updateLog(logId, payload)
      : this.api.addLog(this.customerId, payload);

    req$.subscribe({
      next: () => {
        this.snack.open(logId ? 'อัปเดตประวัติการติดต่อแล้ว' : 'บันทึกประวัติการติดต่อแล้ว', 'ปิด', {
          duration: 2500,
        });
        this.editingLogId.set(null);
        this.resetLogForm();
        this.refreshChildren();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
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
          if (this.editingLogId() === log.id) {
            this.cancelEditLog();
          }
          this.snack.open('ลบประวัติการติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }
}
