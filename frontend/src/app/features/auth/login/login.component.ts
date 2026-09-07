import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  hidePassword = true;

  readonly form = this.fb.nonNullable.group({
    username: ['superadmin', Validators.required],
    password: ['password', Validators.required],
  });

  readonly demoAccounts = [
    { user: 'superadmin', role: 'Super Admin — ทุกเมนู + จัดการบทบาท' },
    { user: 'admin', role: 'Admin — ทุกเมนู แต่แก้บทบาทไม่ได้' },
    { user: 'support', role: 'User / ซัพพอร์ต' },
    { user: 'multi', role: 'User / ซัพพอร์ต + การตลาด' },
    { user: 'newbie', role: 'User — ยังไม่มีบทบาท (หน้าขอสิทธิ์)' },
  ];

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.auth.defaultAppPath());
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
      },
    });
  }

  fillDemo(username: string): void {
    this.form.patchValue({ username, password: 'password' });
    this.error.set(null);
  }
}
