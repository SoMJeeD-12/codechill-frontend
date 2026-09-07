import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Role } from '../../core/models/permission.model';
import { AuthService } from '../../core/services/auth.service';
import { RoleService } from '../../core/services/role.service';
import { UserService } from '../../core/services/user.service';
import { RoleEditorDialogComponent } from './role-editor-dialog.component';

@Component({
  selector: 'app-roles-page',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './roles-page.component.html',
  styleUrl: './roles-page.component.scss',
})
export class RolesPageComponent implements OnInit {
  private readonly rolesApi = inject(RoleService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly roles = signal<Role[]>([]);
  readonly loading = signal(false);
  readonly canManage = computed(() => this.auth.isSuperAdmin());
  readonly columns = ['name', 'description', 'menus', 'actions'];

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.rolesApi.list().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  menuCount(role: Role): number {
    return role.permissions.filter((p) => p.actions.includes('view')).length;
  }

  openCreate(): void {
    if (!this.canManage()) {
      this.snack.open('เฉพาะ Super Admin เท่านั้นที่สร้างบทบาทได้', 'ปิด', { duration: 3000 });
      return;
    }
    this.openEditor();
  }

  openEdit(role: Role): void {
    if (!this.canManage()) {
      this.snack.open('เฉพาะ Super Admin เท่านั้นที่แก้ไขบทบาทได้', 'ปิด', { duration: 3000 });
      return;
    }
    this.openEditor(role);
  }

  remove(role: Role): void {
    if (!this.canManage()) {
      return;
    }
    if (!confirm(`ลบบทบาท "${role.name}" ? ผู้ใช้ที่ผูกบทบาทนี้จะถูกถอดสิทธิ์ออก`)) {
      return;
    }
    this.rolesApi.remove(role.id).subscribe({
      next: () => {
        this.usersApi.detachRole(role.id);
        this.auth.refreshSession();
        this.snack.open('ลบบทบาทแล้ว', 'ปิด', { duration: 2500 });
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  private openEditor(role?: Role): void {
    const ref = this.dialog.open(RoleEditorDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      data: { role: role ?? null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.auth.refreshSession();
        this.reload();
      }
    });
  }
}
