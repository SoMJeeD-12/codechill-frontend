import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

const COUNTDOWN_S = 5;

/** ถูกเข้าสู่ระบบจากเครื่องอื่น — นับถอยหลังแล้วปิดเอง (ผู้เรียกพาไปหน้าล็อกอิน) */
@Component({
  selector: 'app-session-kicked-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="kicked" role="alertdialog" aria-labelledby="kicked-title" aria-describedby="kicked-body">
      <div class="kicked__icon">
        <mat-icon>devices_other</mat-icon>
      </div>
      <h2 id="kicked-title" class="kicked__title">บัญชีนี้ถูกเข้าสู่ระบบจากเครื่องอื่น</h2>
      <div id="kicked-body" class="kicked__body">
        <p>
          มีการเข้าสู่ระบบด้วยบัญชีของคุณจากอุปกรณ์อื่น
          ระบบให้ใช้งานได้ครั้งละหนึ่งเครื่อง เครื่องนี้จึงถูกออกจากระบบ
        </p>
        <p class="kicked__hint">
          หากไม่ใช่คุณ กรุณาเข้าสู่ระบบใหม่แล้วเปลี่ยนรหัสผ่าน หรือแจ้งผู้ดูแลระบบ
        </p>
      </div>
      <p class="kicked__countdown" aria-live="polite">
        จะออกจากระบบใน <strong>{{ seconds() }}</strong> วินาที
      </p>
      <button mat-flat-button color="primary" type="button" class="kicked__go" (click)="close()">
        ไปหน้าเข้าสู่ระบบเลย
      </button>
    </div>
  `,
  styles: `
    .kicked {
      display: grid;
      justify-items: center;
      gap: 0.6rem;
      padding: 1.6rem 1.5rem 1.4rem;
      text-align: center;
      color: var(--app-ink);
    }
    .kicked__icon {
      display: grid;
      place-items: center;
      width: 3.25rem;
      height: 3.25rem;
      border-radius: 999px;
      background: var(--app-warn-soft);
      color: var(--app-warn);
    }
    .kicked__icon mat-icon {
      width: 28px;
      height: 28px;
      font-size: 28px;
    }
    .kicked__title {
      margin: 0.2rem 0 0;
      font-size: 1.15rem;
      font-weight: 700;
    }
    .kicked__body p {
      margin: 0 0 0.4rem;
      line-height: 1.55;
      color: var(--app-text-soft);
    }
    .kicked__hint {
      font-size: 0.86rem;
      color: var(--app-muted) !important;
    }
    .kicked__countdown {
      margin: 0.3rem 0 0.2rem;
      font-size: 0.95rem;
      color: var(--app-muted);
    }
    .kicked__countdown strong {
      display: inline-block;
      min-width: 1.4em;
      font-size: 1.35rem;
      color: var(--app-danger);
      font-variant-numeric: tabular-nums;
    }
    .kicked__go {
      width: 100%;
    }
  `,
})
export class SessionKickedDialogComponent {
  private readonly ref = inject(MatDialogRef<SessionKickedDialogComponent>);
  readonly seconds = signal(COUNTDOWN_S);

  constructor() {
    const timer = window.setInterval(() => {
      const next = this.seconds() - 1;
      if (next < 1) {
        this.close();
        return;
      }
      this.seconds.set(next);
    }, 1000);
    inject(DestroyRef).onDestroy(() => window.clearInterval(timer));
  }

  close(): void {
    this.ref.close();
  }
}
