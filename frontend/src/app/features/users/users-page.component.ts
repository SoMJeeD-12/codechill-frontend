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
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';

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

  readonly filteredUsers = computed(() => {
    const filter = this.statusFilter();
    let list = this.users();
    if (filter !== 'ALL') {
      list = list.filter((u) => u.status === filter);
    }
    const q = this.search().trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter((u) => {
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
  });

  readonly pager = createClientPager(this.filteredUsers);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.reload();
    this.rolesApi.listAssignable().subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => this.roles.set([]),
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

  openCreate(): void {
    this.openForm();
  }

  openEdit(user: User): void {
    this.openForm(user);
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
