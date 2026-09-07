import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
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
import { TICKET_STATUS_LABELS, Ticket } from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { TicketService } from '../../core/services/ticket.service';
import { combineDateAndTime, nowTimeString } from '../../core/utils/date.util';

@Component({
  selector: 'app-customer-detail-page',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
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
  ],
  templateUrl: './customer-detail-page.component.html',
  styleUrl: './customer-detail-page.component.scss',
})
export class CustomerDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly ticketsApi = inject(TicketService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly customer = signal<Customer | null>(null);
  readonly contacts = signal<Contact[]>([]);
  readonly logs = signal<CommunicationLog[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly tickets = signal<Ticket[]>([]);
  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly channelLabels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly notFound = signal(false);

  statusLabel(status: Customer['status']): string {
    return this.statusLabels[status];
  }

  readonly contactForm = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    position: [''],
    phone: [''],
    email: [''],
    isPrimary: [false],
  });

  readonly logForm = this.fb.group({
    channel: ['LINE' as CommunicationChannel, Validators.required],
    summary: ['', Validators.required],
    contactedDate: [new Date() as Date | null, Validators.required],
    contactedTime: [nowTimeString(), Validators.required],
    attachmentName: [''],
  });

  private customerId = 0;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.customerId = id;
    const customer = this.api.getCustomer(id);
    if (!customer) {
      this.notFound.set(true);
      return;
    }
    this.customer.set(customer);
    this.refreshChildren();
  }

  refreshChildren(): void {
    this.contacts.set(this.api.getContacts(this.customerId));
    this.logs.set(this.api.getLogs(this.customerId));
    this.projects.set(this.projectsApi.getProjectsByCustomer(this.customerId));
    this.tickets.set(this.ticketsApi.getByCustomer(this.customerId));
  }

  saveContact(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }
    this.api.saveContact(this.customerId, this.contactForm.getRawValue()).subscribe({
      next: () => {
        this.snack.open('บันทึกผู้ติดต่อแล้ว', 'ปิด', { duration: 2500 });
        this.contactForm.reset({
          fullName: '',
          position: '',
          phone: '',
          email: '',
          isPrimary: false,
        });
        this.refreshChildren();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  removeContact(contact: Contact): void {
    if (!confirm(`ลบผู้ติดต่อ ${contact.fullName}?`)) {
      return;
    }
    this.api.removeContact(contact.id).subscribe({
      next: () => {
        this.snack.open('ลบผู้ติดต่อแล้ว', 'ปิด', { duration: 2500 });
        this.refreshChildren();
      },
    });
  }

  saveLog(): void {
    if (this.logForm.invalid) {
      this.logForm.markAllAsTouched();
      return;
    }
    const raw = this.logForm.getRawValue();
    const contactedAt = combineDateAndTime(raw.contactedDate, raw.contactedTime);
    this.api
      .addLog(this.customerId, {
        channel: raw.channel as CommunicationChannel,
        summary: raw.summary ?? '',
        contactedAt,
        createdByName: this.auth.currentUser()?.fullName ?? 'ไม่ระบุ',
        attachmentName: (raw.attachmentName ?? '').trim() || null,
      })
      .subscribe({
        next: () => {
          this.snack.open('บันทึกประวัติการติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.logForm.patchValue({
            summary: '',
            attachmentName: '',
            contactedDate: new Date(),
            contactedTime: nowTimeString(),
          });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }
}
