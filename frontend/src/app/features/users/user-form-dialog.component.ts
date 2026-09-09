import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
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
import { AccountType, User } from '../../core/models/user.model';
import { UserService } from '../../core/services/user.service';
import { sanitizePhoneDigits, thaiPhoneValidator } from '../../core/utils/phone.util';
import { PhoneInputDirective } from '../../shared/directives/phone-input.directive';

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
    PhoneInputDirective,
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
    username: [{ value: '', disabled: this.isEdit }, Validators.required],
    password: [''],
    fullName: ['', Validators.required],
    nickname: [''],
    employeeCode: [''],
    email: ['', Validators.email],
    phone: ['', thaiPhoneValidator],
    position: [''],
    accountType: ['USER' as AccountType, Validators.required],
    roleIds: [[] as number[]],
  });

  constructor() {
    const user = this.data.user;
    if (user) {
      this.form.patchValue({
        username: user.username,
        fullName: user.fullName,
        nickname: user.nickname ?? '',
        employeeCode: user.employeeCode ?? '',
        email: user.email ?? '',
        phone: sanitizePhoneDigits(user.phone),
        position: user.position ?? '',
        accountType: user.accountType === 'SUPER_ADMIN' ? 'USER' : user.accountType,
        roleIds: (user.roles ?? []).map((r) => r.id),
      });
      if (this.isSuper) {
        this.form.disable();
      }
    } else {
      this.form.controls.password.addValidators(Validators.required);
      this.form.controls.password.updateValueAndValidity();
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
    const roleIds = raw.accountType === 'USER' ? raw.roleIds : [];
    const profile = {
      fullName: raw.fullName.trim(),
      employeeCode: optional(raw.employeeCode),
      email: optional(raw.email),
      nickname: optional(raw.nickname),
      phone: optional(raw.phone) ? sanitizePhoneDigits(raw.phone) : undefined,
      position: optional(raw.position),
      accountType: raw.accountType,
    };

    this.saving.set(true);
    this.error.set(null);

    const existing = this.data.user;
    const req$: Observable<User> = existing
      ? this.usersApi
          .update(existing.id, profile)
          .pipe(
            switchMap((user) =>
              sameRoles(existing.roles.map((r) => r.id), roleIds)
                ? of(user)
                : this.usersApi.assignRoles(existing.id, roleIds)
            )
          )
      : this.usersApi.create({
          ...profile,
          username: raw.username.trim(),
          password: raw.password,
          roleIds,
        });

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

function optional(value: string): string | undefined {
  const v = value.trim();
  return v === '' ? undefined : v;
}

function sameRoles(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
