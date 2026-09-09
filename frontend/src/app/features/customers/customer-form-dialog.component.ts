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
  private readonly ref = inject(MatDialogRef<CustomerFormDialogComponent, boolean>);
  readonly data = inject<{ customer: Customer | null }>(MAT_DIALOG_DATA);

  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly statuses = Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[];
  readonly users = this.usersApi.users;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.customer;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    code: [''],
    taxId: [''],
    businessType: [''],
    address: [''],
    province: [''],
    postalCode: [''],
    phone: ['', thaiPhoneValidator],
    email: ['', Validators.email],
    website: [''],
    lineOfficialId: [''],
    facebookUrl: [''],
    status: ['PROSPECT' as CustomerStatus, Validators.required],
    source: [''],
    ownerUserId: [null as number | null],
    note: [''],
  });

  constructor() {
    this.usersApi.loadForPicker().subscribe({ error: () => undefined });
    const c = this.data.customer;
    if (c) {
      this.form.patchValue({
        name: c.name,
        code: c.code ?? '',
        taxId: c.taxId ?? '',
        businessType: c.businessType ?? '',
        address: c.address ?? '',
        province: c.province ?? '',
        postalCode: c.postalCode ?? '',
        phone: sanitizePhoneDigits(c.phone),
        email: c.email ?? '',
        website: c.website ?? '',
        lineOfficialId: c.lineOfficialId ?? '',
        facebookUrl: c.facebookUrl ?? '',
        status: c.status,
        source: c.source ?? '',
        ownerUserId: c.ownerUserId ?? null,
        note: c.note ?? '',
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
      code: trimmed(raw.code),
      taxId: trimmed(raw.taxId),
      businessType: trimmed(raw.businessType),
      address: trimmed(raw.address),
      province: trimmed(raw.province),
      postalCode: trimmed(raw.postalCode),
      phone: trimmed(raw.phone) ? sanitizePhoneDigits(raw.phone) : undefined,
      email: trimmed(raw.email),
      website: trimmed(raw.website),
      lineOfficialId: trimmed(raw.lineOfficialId),
      facebookUrl: trimmed(raw.facebookUrl),
      status: raw.status,
      source: trimmed(raw.source),
      ownerUserId: raw.ownerUserId ?? undefined,
      note: trimmed(raw.note),
    };
    this.saving.set(true);
    this.error.set(null);
    const req$ = this.data.customer
      ? this.api.updateCustomer(this.data.customer.id, payload)
      : this.api.createCustomer(payload);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('บันทึกลูกค้าแล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
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
