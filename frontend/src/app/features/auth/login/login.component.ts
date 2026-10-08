import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment, type DevAccount } from '../../../../environments/environment';
import { RateLimitService } from '../../../core/http/rate-limit.interceptor';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rateLimit = inject(RateLimitService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** เหตุผลที่หลุดจากระบบ เช่น ถูกเข้าสู่ระบบจากเครื่องอื่น */
  readonly notice = this.auth.signedOutNotice;
  readonly devAccounts = environment.devAccounts;
  readonly rememberMe = signal(true);
  hidePassword = true;

  private readonly now = signal(Date.now());
  /** วินาทีที่เหลือก่อนลองล็อกอินใหม่ได้ (ตาม Retry-After ของ 429) */
  readonly lockSeconds = computed(() =>
    Math.max(0, Math.ceil((this.rateLimit.loginBlockedUntil() - this.now()) / 1000))
  );
  readonly locked = computed(() => this.lockSeconds() > 0);

  constructor() {
    let tick: number | null = null;
    const stop = () => {
      if (tick != null) {
        window.clearInterval(tick);
        tick = null;
      }
    };
    effect(() => {
      const until = this.rateLimit.loginBlockedUntil();
      untracked(() => {
        this.now.set(Date.now());
        if (until <= Date.now() || tick != null) {
          return;
        }
        tick = window.setInterval(() => {
          this.now.set(Date.now());
          if (!this.locked()) {
            stop();
            this.error.set(null);
          }
        }, 1000);
      });
    });
    inject(DestroyRef).onDestroy(stop);
  }

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    // กันกรณีกดย้อนกลับแล้วยังค้างที่หน้า login ทั้งที่มี session
    void this.redirectIfAuthenticated();
  }

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
    if (this.form.invalid || this.loading() || this.locked()) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.auth.isAuthenticated()) {
      void this.redirectIfAuthenticated();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.auth.signedOutNotice.set(null);

    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password, this.rememberMe()).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.auth.defaultAppPath(), {
          replaceUrl: true,
        });
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
      },
    });
  }

  private async redirectIfAuthenticated(): Promise<void> {
    await this.auth.whenReady();
    if (!this.auth.isAuthenticated()) {
      return;
    }
    await this.router.navigateByUrl(this.auth.defaultAppPath(), {
      replaceUrl: true,
    });
  }
}
