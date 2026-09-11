import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CUSTOMER_STATUS_LABELS,
  Customer,
  CustomerStatus,
} from '../../core/models/customer.model';
import { CustomerService } from '../../core/services/customer.service';
import { CustomerFormDialogComponent } from './customer-form-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

@Component({
  selector: 'app-customers-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    TablePaginatorComponent,
  ],
  templateUrl: './customers-page.component.html',
  styleUrl: './customers-page.component.scss',
})
export class CustomersPageComponent implements OnInit {
  private readonly api = inject(CustomerService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly customers = signal<Customer[]>([]);
  readonly statusFilter = signal<CustomerStatus | 'ALL'>('ACTIVE');
  readonly search = signal('');
  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly statuses = Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[];
  readonly columns = ['name', 'phone', 'owner', 'status', 'actions'];
  readonly searchControl = this.fb.nonNullable.control('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.customers().filter((c) => {
      const matchStatus = status === 'ALL' || c.status === status;
      const matchQ =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.taxId ?? '').includes(q) ||
        (c.owner?.fullName ?? '').toLowerCase().includes(q);
      return matchStatus && matchQ;
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.reload();
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
  }

  reload(): void {
    this.api.listCustomers().subscribe((list) => this.customers.set(list));
  }

  openCreate(): void {
    this.openForm();
  }

  openEdit(customer: Customer): void {
    this.openForm(customer);
  }

  statusLabel(status: CustomerStatus): string {
    return this.statusLabels[status];
  }

  private openForm(customer?: Customer): void {
    const ref = this.dialog.open(CustomerFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { customer: customer ?? null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}
