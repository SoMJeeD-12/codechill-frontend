import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatProgressSpinnerModule],
  template: `
    @if (auth.initStatus() === 'loading' || auth.initStatus() === 'idle') {
      <div class="splash">
        <mat-spinner diameter="44"></mat-spinner>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100%;
    }

    .splash {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--app-bg);
    }
  `,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  /** สร้างตั้งแต่เริ่มแอป — ผูกโหมดสว่าง/มืดกับ <html> */
  private readonly theme = inject(ThemeService);
}
