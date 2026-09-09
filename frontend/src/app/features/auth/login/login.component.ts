import { Component, HostListener, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment, DevAccount } from '../../../../environments/environment';
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
  readonly devAccounts = environment.devAccounts;
  hidePassword = true;

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey || !event.shiftKey) {
      return;
    }
    // Shift+เลขบางคีย์บอร์ดให้ event.key เป็นสัญลักษณ์ — ใช้ Digit จาก code
    const digit = /^Digit(\d)$/.exec(event.code)?.[1] ?? event.key;
    const account = this.devAccounts.find((a) => a.key === digit);
    if (!account) {
      return;
    }
    event.preventDefault();
    this.loginAs(account);
  }

  loginAs(account: DevAccount): void {
    this.form.patchValue({ username: account.username, password: account.password });
    this.submit();
  }

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
}
