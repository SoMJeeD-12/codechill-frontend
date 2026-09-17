import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CUSTOMER_STATUS_LABELS,
  Customer,
  CustomerStatus,
} from '../../core/models/customer.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { CustomerFormDialogComponent } from './customer-form-dialog.component';
import { CustomerPreviewDialogComponent } from './customer-preview-dialog.component';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { PICKER_DEBOUNCE_MS, PICKER_MIN_CHARS } from '../../shared/components/entity-picker.component';
import { createTableSort } from '../../shared/utils/table-sort';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

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
    MatMenuModule,
    RowActionsComponent,
    TablePaginatorComponent,
  ],
  templateUrl: './customers-page.component.html',
  styleUrl: './customers-page.component.scss',
})
export class CustomersPageComponent implements OnInit {
  private readonly api = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  /** จากเมนูมุมมอง 360° — รายการเดียวกันแต่เข้าหน้ารายละเอียดโหมดสรุป */
  readonly is360Mode = this.route.snapshot.data['mode'] === '360';

  readonly customers = signal<Customer[]>([]);
  readonly statusFilter = signal<CustomerStatus | 'ALL'>('ACTIVE');
  readonly search = signal('');
  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly statuses = Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[];
  readonly columns = ['name', 'phone', 'owner', 'status', 'actions'];
  readonly searchControl = this.fb.nonNullable.control('');

  readonly canUpdate = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('customer.update') ||
      this.auth.hasPermission('customers', 'update')
    );
  });
  readonly canDelete = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('customer.delete') ||
      this.auth.hasPermission('customers', 'delete') ||
      this.canUpdate()
    );
  });

  readonly tableSort = createTableSort<'name' | 'phone' | 'owner' | 'status'>('name');

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const list = this.customers().filter((c) => status === 'ALL' || c.status === status);
    return this.tableSort.apply(list, (row, key) => {
      switch (key) {
        case 'name':
          return row.name;
        case 'phone':
          return row.phone ?? '';
        case 'owner':
          return row.owner?.fullName ?? '';
        case 'status':
          return this.statusLabel(row.status);
      }
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.reload();
    this.searchControl.valueChanges
      .pipe(debounceTime(PICKER_DEBOUNCE_MS), distinctUntilChanged())
      .subscribe((v) => {
        this.search.set(v);
        this.pager.reset();
        this.reload();
      });
  }

  reload(): void {
    const q = this.search().trim();
    const params = q.length >= PICKER_MIN_CHARS ? { search: q, limit: 100 } : { limit: 100 };
    this.api.listCustomers(params).subscribe((list) => this.customers.set(list));
  }

  openCreate(): void {
    this.openForm();
  }

  openEdit(customer: Customer): void {
    this.openForm(customer);
  }

  customerRowActions(row: Customer): RowAction[] {
    const actions: RowAction[] = [
      {
        label: this.is360Mode ? 'เปิดมุมมอง 360°' : 'รายละเอียด',
        primary: true,
        icon: this.is360Mode ? 'travel_explore' : 'visibility',
        run: () => this.openDetail(row),
      },
    ];
    if (!this.is360Mode && this.canUpdate()) {
      actions.push({ label: 'แก้ไข', icon: 'edit', run: () => this.openEdit(row) });
    }
    if (!this.is360Mode && this.canDelete()) {
      actions.push({ label: 'ลบ', icon: 'delete', danger: true, run: () => this.remove(row) });
    }
    return actions;
  }

  openDetail(customer: Customer): void {
    if (this.is360Mode) {
      void this.router.navigate(['/app/customer-360', customer.id]);
      return;
    }
    this.dialog.open(CustomerPreviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { customerId: customer.id, seed: customer },
    });
  }

  remove(customer: Customer): void {
    if (!this.canDelete()) {
      this.snack.open('ไม่มีสิทธิ์ลบลูกค้า', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบลูกค้า',
      message: `ต้องการลบ「${customer.name}」หรือไม่?\nข้อมูลที่เกี่ยวข้องอาจถูกลบหรือใช้งานไม่ได้`,
      confirmLabel: 'ลบลูกค้า',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.removeCustomer(customer.id).subscribe({
        next: () => {
          this.snack.open('ลบลูกค้าแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }

  statusLabel(status: CustomerStatus): string {
    return this.statusLabels[status];
  }

  toggleSort(key: 'name' | 'phone' | 'owner' | 'status'): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(key: 'name' | 'phone' | 'owner' | 'status'): string {
    return this.tableSort.sortIcon(key);
  }

  private openForm(customer?: Customer): void {
    const ref = this.dialog.open(CustomerFormDialogComponent, {
      ...FORM_DIALOG,
      data: { customer: customer ?? null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}
