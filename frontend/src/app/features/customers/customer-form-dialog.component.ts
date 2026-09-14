import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, of, switchMap } from 'rxjs';
import {
  CUSTOMER_STATUS_LABELS,
  Customer,
  CustomerStatus,
} from '../../core/models/customer.model';
import { CustomerInput, CustomerService } from '../../core/services/customer.service';
import { UserService } from '../../core/services/user.service';
import { sanitizePhoneDigits, thaiPhoneValidator } from '../../core/utils/phone.util';
import { PhoneInputDirective } from '../../shared/directives/phone-input.directive';

@Component({
  selector: 'app-customer-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    PhoneInputDirective,
  ],
  templateUrl: './customer-form-dialog.component.html',
  styleUrl: './customer-form-dialog.component.scss',
})
export class CustomerFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<CustomerFormDialogComponent, boolean | Customer>);
  readonly data = inject<{ customer: Customer | null; returnCustomer?: boolean }>(MAT_DIALOG_DATA);

  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly statuses = Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[];
  readonly users = this.usersApi.users;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.customer;
  private primaryContactId: number | null = null;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', thaiPhoneValidator],
    email: ['', Validators.email],
    lineOfficialId: [''],
    facebookUrl: [''],
    status: ['ACTIVE' as CustomerStatus, Validators.required],
    ownerUserId: [null as number | null],
    taxId: [''],
    address: [''],
    note: [''],
    primaryContact: this.fb.nonNullable.group({
      name: [''],
      phone: ['', thaiPhoneValidator],
      lineId: [''],
    }),
  });

  constructor() {
    this.usersApi.loadForPicker().subscribe({ error: () => undefined });
    const c = this.data.customer;
    if (c) {
      this.form.patchValue({
        name: c.name,
        phone: sanitizePhoneDigits(c.phone),
        email: c.email ?? '',
        lineOfficialId: c.lineOfficialId ?? '',
        facebookUrl: c.facebookUrl ?? '',
        status: normalizeStatus(c.status),
        ownerUserId: c.ownerUserId ?? null,
        taxId: c.taxId ?? '',
        address: c.address ?? '',
        note: c.note ?? '',
      });
      this.api.listContacts(c.id).subscribe({
        next: (rows) => {
          const primary = rows.find((x) => x.isPrimary) ?? rows[0];
          if (primary) {
            this.primaryContactId = primary.id;
            this.form.controls.primaryContact.patchValue({
              name: primary.name,
              phone: sanitizePhoneDigits(primary.phone),
              lineId: primary.lineId ?? '',
            });
          }
        },
        error: () => undefined,
      });
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: CustomerInput = {
      name: raw.name.trim(),
      status: raw.status,
    };
    const phone = trimmed(raw.phone);
    if (phone) {
      payload.phone = sanitizePhoneDigits(phone);
    }
    const email = trimmed(raw.email);
    if (email) {
      payload.email = email;
    }
    const lineOfficialId = trimmed(raw.lineOfficialId);
    if (lineOfficialId) {
      payload.lineOfficialId = lineOfficialId;
    }
    const facebookUrl = trimmed(raw.facebookUrl);
    if (facebookUrl) {
      payload.facebookUrl = facebookUrl;
    }
    if (raw.ownerUserId != null) {
      payload.ownerUserId = raw.ownerUserId;
    }
    const taxId = trimmed(raw.taxId);
    if (taxId) {
      payload.taxId = taxId;
    }
    const address = trimmed(raw.address);
    if (address) {
      payload.address = address;
    }
    const note = trimmed(raw.note);
    if (note) {
      payload.note = note;
    }

    this.saving.set(true);
    this.error.set(null);

    const contactName = trimmed(raw.primaryContact.name);
    const contactPhone = trimmed(raw.primaryContact.phone);
    const contactLine = trimmed(raw.primaryContact.lineId);

    const req$: Observable<Customer> = this.data.customer
      ? this.api.updateCustomer(this.data.customer.id, payload)
      : this.api.createCustomer(payload);

    req$
      .pipe(
        switchMap((customer) => {
          if (!contactName) {
            return of(customer);
          }
          const contactPayload = {
            name: contactName,
            phone: contactPhone ? sanitizePhoneDigits(contactPhone) : undefined,
            lineId: contactLine,
            isPrimary: true as const,
          };
          return this.api
            .saveContact(customer.id, contactPayload, this.primaryContactId ?? undefined)
            .pipe(switchMap(() => of(customer)));
        })
      )
      .subscribe({
        next: (customer) => {
          this.saving.set(false);
          const codeHint =
            !this.isEdit && customer.code?.trim()
              ? ` · รหัส ${customer.code.trim()}`
              : '';
          this.snack.open(
            this.isEdit ? 'บันทึกลูกค้าแล้ว' : `สร้างลูกค้าแล้ว${codeHint}`,
            'ปิด',
            { duration: codeHint ? 5000 : 2500 }
          );
          this.ref.close(this.data.returnCustomer ? customer : true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}

function trimmed(value: string): string | undefined {
  const v = value.trim();
  return v === '' ? undefined : v;
}

function normalizeStatus(status: string): CustomerStatus {
  if (status === 'INACTIVE' || status === 'CHURNED') {
    return status;
  }
  return 'ACTIVE';
}
