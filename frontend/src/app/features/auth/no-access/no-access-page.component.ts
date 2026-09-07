import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-no-access-page',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './no-access-page.component.html',
  styleUrl: './no-access-page.component.scss',
})
export class NoAccessPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;

  logout(): void {
    this.auth.logout();
  }

  refresh(): void {
    this.auth.refreshSession();
    void this.router.navigateByUrl(this.auth.defaultAppPath());
  }
}
