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
import { Role } from '../../core/models/permission.model';
import { AccountType, User, UserStatus } from '../../core/models/user.model';
import { UserInput, UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-user-form-dialog',
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
  templateUrl: './user-form-dialog.component.html',
  styleUrl: './user-form-dialog.component.scss',
})
export class UserFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UserService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<UserFormDialogComponent, boolean>);
  readonly data = inject<{ user: User | null; roles: Role[] }>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.user;
  readonly isSuper = this.data.user?.accountType === 'SUPER_ADMIN';

  readonly form = this.fb.nonNullable.group({
    username: [{ value: '', disabled: this.isSuper }, Validators.required],
    email: [{ value: '', disabled: this.isSuper }, [Validators.required, Validators.email]],
    fullName: [{ value: '', disabled: this.isSuper }, Validators.required],
    accountType: ['USER' as AccountType, Validators.required],
    status: ['ACTIVE' as UserStatus, Validators.required],
    roleIds: [[] as number[]],
    password: [''],
  });

  constructor() {
    if (this.data.user) {
      this.form.patchValue({
        username: this.data.user.username,
        email: this.data.user.email,
        fullName: this.data.user.fullName,
        accountType:
          this.data.user.accountType === 'SUPER_ADMIN'
            ? 'USER'
            : this.data.user.accountType,
        status: this.data.user.status,
        roleIds: [...this.data.user.roleIds],
      });
      if (this.data.user.accountType === 'SUPER_ADMIN') {
        this.form.disable();
      }
    }
  }

  get showRoles(): boolean {
    return this.form.getRawValue().accountType === 'USER';
  }

  save(): void {
    if (this.isSuper) {
      this.ref.close(false);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: UserInput = {
      username: raw.username,
      email: raw.email,
      fullName: raw.fullName,
      accountType: raw.accountType,
      status: raw.status,
      roleIds: raw.accountType === 'USER' ? raw.roleIds : [],
      password: raw.password || undefined,
    };

    this.saving.set(true);
    this.error.set(null);
    const req$ = this.data.user
      ? this.usersApi.update(this.data.user.id, payload)
      : this.usersApi.create(payload);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('บันทึกผู้ใช้แล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
