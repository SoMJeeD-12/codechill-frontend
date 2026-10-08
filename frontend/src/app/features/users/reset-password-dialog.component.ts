import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { User } from '../../core/models/user.model';
import { UserService } from '../../core/services/user.service';

const passwordMatchValidator: ValidatorFn = (
  group: AbstractControl
): ValidationErrors | null => {
  const passwordCtrl = group.get('newPassword');
  const confirmCtrl = group.get('confirmPassword');
  if (!passwordCtrl || !confirmCtrl) {
    return null;
  }
  const password = String(passwordCtrl.value ?? '');
  const confirm = String(confirmCtrl.value ?? '');
  const mismatch = !!password && !!confirm && password !== confirm;
  const current = confirmCtrl.errors;
  if (mismatch) {
    if (!current?.['passwordMismatch']) {
      confirmCtrl.setErrors({ ...(current ?? {}), passwordMismatch: true });
    }
    return { passwordMismatch: true };
  }
  if (current?.['passwordMismatch']) {
    const next = { ...current };
    delete next['passwordMismatch'];
    confirmCtrl.setErrors(Object.keys(next).length ? next : null);
  }
  return null;
};

@Component({
  selector: 'app-reset-password-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>ตั้งรหัสผ่านใหม่</h2>
    <mat-dialog-content>
      <p class="target">
        ผู้ใช้ · <strong>{{ data.user.fullName }}</strong>
        <span class="meta">({{ data.user.username }})</span>
      </p>
      <p class="hint">
        ตั้งรหัสชั่วคราว 8–72 ตัว แล้วบอกผู้ใช้นี้ทาง LINE หรือปากเปล่า
        ผู้ใช้ต้องล็อกอินใหม่ แล้วเปลี่ยนรหัสเองที่โปรไฟล์
        (access token ใบเก่าอาจใช้ได้จนหมดอายุ)
      </p>
      <form [formGroup]="form" class="form" id="reset-password-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>รหัสผ่านใหม่</mat-label>
          <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
          @if (form.controls.newPassword.hasError('required')) {
            <mat-error>กรุณาระบุรหัสผ่านใหม่</mat-error>
          } @else if (form.controls.newPassword.hasError('minlength')) {
            <mat-error>รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร</mat-error>
          } @else if (form.controls.newPassword.hasError('maxlength')) {
            <mat-error>รหัสผ่านยาวได้ไม่เกิน 72 ตัวอักษร</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ยืนยันรหัสผ่าน</mat-label>
          <input
            matInput
            type="password"
            formControlName="confirmPassword"
            autocomplete="new-password"
          />
          @if (form.controls.confirmPassword.hasError('required')) {
            <mat-error>กรุณายืนยันรหัสผ่าน</mat-error>
          } @else if (form.controls.confirmPassword.hasError('passwordMismatch')) {
            <mat-error>รหัสผ่านไม่ตรงกัน</mat-error>
          }
        </mat-form-field>
      </form>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="reset-password-form"
        [disabled]="saving()"
      >
        ตั้งรหัสผ่าน
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .target {
      margin: 0 0 0.55rem;
      font-size: 0.95rem;
    }

    .meta {
      color: var(--app-muted);
      font-weight: 400;
    }

    .hint {
      margin: 0 0 0.85rem;
      color: var(--app-muted);
      font-size: 0.85rem;
      line-height: 1.45;
    }

    .form {
      display: grid;
      gap: 0.15rem;
      min-width: min(420px, 86vw);
    }

    .full {
      width: 100%;
    }

    .error {
      margin: 0.35rem 0 0;
      color: var(--app-danger-ink);
      font-size: 0.88rem;
    }
  `,
})
export class ResetPasswordDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UserService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<ResetPasswordDialogComponent, boolean>);
  readonly data = inject<{ user: User }>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator }
  );

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const newPassword = this.form.controls.newPassword.value;
    this.saving.set(true);
    this.error.set(null);
    this.usersApi.resetPassword(this.data.user.id, newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open(
          'ตั้งรหัสผ่านชั่วคราวแล้ว — บอกผู้ใช้ทาง LINE หรือปากเปล่า ให้ล็อกอินใหม่แล้วเปลี่ยนรหัสเอง (refresh ใช้ต่อไม่ได้)',
          'ปิด',
          { duration: 7000 }
        );
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ');
      },
    });
  }
}
