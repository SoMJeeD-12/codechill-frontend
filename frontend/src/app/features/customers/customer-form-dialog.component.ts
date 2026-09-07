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
  ],
  templateUrl: './customer-form-dialog.component.html',
  styleUrl: './customer-form-dialog.component.scss',
})
export class CustomerFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<CustomerFormDialogComponent, boolean>);
  readonly data = inject<{ customer: Customer | null }>(MAT_DIALOG_DATA);

  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly statuses = Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.customer;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    taxId: [''],
    address: [''],
    businessType: [''],
    status: ['NEW' as CustomerStatus, Validators.required],
    lifetimeValue: [0, Validators.min(0)],
  });

  constructor() {
    if (this.data.customer) {
      this.form.patchValue({
        name: this.data.customer.name,
        taxId: this.data.customer.taxId,
        address: this.data.customer.address,
        businessType: this.data.customer.businessType,
        status: this.data.customer.status,
        lifetimeValue: this.data.customer.lifetimeValue,
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
      name: raw.name,
      taxId: raw.taxId,
      address: raw.address,
      businessType: raw.businessType,
      status: raw.status,
      lifetimeValue: Number(raw.lifetimeValue) || 0,
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
