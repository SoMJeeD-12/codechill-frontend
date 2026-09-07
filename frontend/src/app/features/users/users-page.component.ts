import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Role } from '../../core/models/permission.model';
import { AccountType, User, UserStatus } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { RoleService } from '../../core/services/role.service';
import { UserService } from '../../core/services/user.service';
import { UserFormDialogComponent } from './user-form-dialog.component';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatSelectModule,
    MatFormFieldModule,
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

  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly statusFilter = signal<UserStatus | 'ALL'>('ALL');

  readonly columns = [
    'fullName',
    'username',
    'accountType',
    'roles',
    'status',
    'lastLoginAt',
    'actions',
  ];

  readonly filteredUsers = computed(() => {
    const filter = this.statusFilter();
    const list = this.users();
    return filter === 'ALL' ? list : list.filter((u) => u.status === filter);
  });

  ngOnInit(): void {
    this.reload();
    this.rolesApi.list().subscribe((roles) => this.roles.set(roles));
  }

  reload(): void {
    this.usersApi.list().subscribe((users) => this.users.set(users));
  }

  roleNames(user: User): string {
    if (user.accountType !== 'USER') {
      return '— (ใช้สิทธิ์ระดับบัญชี)';
    }
    if (!user.roleIds.length) {
      return 'ยังไม่มีบทบาท';
    }
    return user.roleIds
      .map((id) => this.roles().find((r) => r.id === id)?.name ?? `#${id}`)
      .join(', ');
  }

  accountLabel(type: AccountType): string {
    switch (type) {
      case 'SUPER_ADMIN':
        return 'Super Admin';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'User';
    }
  }

  statusLabel(status: UserStatus): string {
    switch (status) {
      case 'ACTIVE':
        return 'ปฏิบัติงาน';
      case 'SUSPENDED':
        return 'พักงาน';
      case 'RESIGNED':
        return 'สิ้นสุดการปฏิบัติงาน';
    }
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
      width: '560px',
      maxWidth: '95vw',
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
