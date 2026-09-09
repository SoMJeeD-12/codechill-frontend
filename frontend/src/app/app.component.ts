import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from './core/services/auth.service';

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
      background: #f7f3ec;
    }
  `,
})
export class AppComponent {
  readonly auth = inject(AuthService);
}
