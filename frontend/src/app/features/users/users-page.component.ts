import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ACCOUNT_TYPE_LABELS,
  AccountType,
  RoleSummary,
  USER_STATUS_LABELS,
  User,
  UserStatus,
} from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { RoleService } from '../../core/services/role.service';
import { UserService } from '../../core/services/user.service';
import { UserFormDialogComponent } from './user-form-dialog.component';
import { ResetPasswordDialogComponent } from './reset-password-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { createTableSort } from '../../shared/utils/table-sort';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
})
export class UsersPageComponent implements OnInit {
  private readonly usersApi = inject(UserService);
  private readonly rolesApi = inject(RoleService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<User[]>([]);
  /** ดรอปดาวน์มอบบทบาท — จาก /roles/assignable ไม่ใช่ GET /roles */
  readonly roles = signal<RoleSummary[]>([]);
  readonly statusFilter = signal<UserStatus | 'ALL'>('ALL');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');

  readonly columns = [
    'fullName',
    'nickname',
    'username',
    'email',
    'phone',
    'accountType',
    'roles',
    'status',
    'actions',
  ];

  readonly tableSort = createTableSort<
    'fullName' | 'nickname' | 'username' | 'email' | 'phone' | 'accountType' | 'status'
  >('fullName');

  readonly filteredUsers = computed(() => {
    const filter = this.statusFilter();
    let list = this.users();
    if (filter !== 'ALL') {
      list = list.filter((u) => u.status === filter);
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter((u) => {
        return (
          u.fullName.toLowerCase().includes(q) ||
          (u.nickname ?? '').toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q) ||
          (u.phone ?? '').includes(q) ||
          this.accountLabel(u.accountType).toLowerCase().includes(q) ||
          this.roleNames(u).toLowerCase().includes(q) ||
          this.statusLabel(u.status).toLowerCase().includes(q)
        );
      });
    }
    return this.tableSort.apply(list, (row, key) => {
      switch (key) {
        case 'fullName':
          return row.fullName;
        case 'nickname':
          return row.nickname ?? '';
        case 'username':
          return row.username;
        case 'email':
          return row.email ?? '';
        case 'phone':
          return row.phone ?? '';
        case 'accountType':
          return this.accountLabel(row.accountType);
        case 'status':
          return this.statusLabel(row.status);
      }
    });
  });

  readonly pager = createClientPager(this.filteredUsers);

  readonly canResetPasswordAny = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('user.reset_password');
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.reload();
    this.rolesApi.listAssignable().subscribe({
      next: (roles) => this.roles.set(roles),
      error: (err) => {
        console.warn('[users assignable roles]', err);
        this.roles.set([]);
      },
    });
  }

  reload(): void {
    this.usersApi.list().subscribe((users) => this.users.set(users));
  }

  roleNames(user: User): string {
    if (user.accountType !== 'USER') {
      return '— (ใช้สิทธิ์ระดับบัญชี)';
    }
    if (!user.roles?.length) {
      return 'ยังไม่มีบทบาท';
    }
    return user.roles.map((r) => r.name).join(', ');
  }

  accountLabel(type: AccountType): string {
    return ACCOUNT_TYPE_LABELS[type];
  }

  statusLabel(status: UserStatus): string {
    return USER_STATUS_LABELS[status];
  }

  toggleSort(
    key: 'fullName' | 'nickname' | 'username' | 'email' | 'phone' | 'accountType' | 'status'
  ): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(
    key: 'fullName' | 'nickname' | 'username' | 'email' | 'phone' | 'accountType' | 'status'
  ): string {
    return this.tableSort.sortIcon(key);
  }

  openCreate(): void {
    this.openForm();
  }

  openEdit(user: User): void {
    this.openForm(user);
  }

  /** แสดงเมื่อมี user.reset_password · ห้ามตั้งของตัวเอง · SUPER_ADMIN ได้เฉพาะ SUPER_ADMIN */
  canResetPassword(user: User): boolean {
    if (!this.canResetPasswordAny()) {
      return false;
    }
    const me = this.auth.currentUser();
    if (!me || me.id === user.id) {
      return false;
    }
    if (user.accountType === 'SUPER_ADMIN' && me.accountType !== 'SUPER_ADMIN') {
      return false;
    }
    return true;
  }

  openResetPassword(user: User): void {
    if (!this.canResetPassword(user)) {
      return;
    }
    this.dialog.open(ResetPasswordDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { user },
    });
  }

  setStatus(user: User, status: UserStatus): void {
    if (user.status === status) {
      return;
    }
    this.usersApi.updateStatus(user.id, status).subscribe({
      next: () => {
        this.snack.open('อัปเดตสถานะแล้ว', 'ปิด', { duration: 2500 });
        if (this.auth.currentUser()?.id === user.id && status !== 'ACTIVE') {
          this.auth.logout();
          return;
        }
        this.auth.refreshSession();
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  private openForm(user?: User): void {
    const ref = this.dialog.open(UserFormDialogComponent, {
      ...FORM_DIALOG,
      data: { user: user ?? null, roles: this.roles() },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.auth.refreshSession();
        this.reload();
      }
    });
  }
}
