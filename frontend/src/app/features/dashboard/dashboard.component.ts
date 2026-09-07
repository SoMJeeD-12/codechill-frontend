import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { MENU_ITEMS } from '../../core/mock/mock-data';
import { MenuItem } from '../../core/models/permission.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);

  readonly user = this.auth.currentUser;

  readonly stats = [
    { label: 'ลูกค้า (mock)', value: '128', icon: 'business' },
    { label: 'โครงการเปิดอยู่', value: '24', icon: 'folder_special' },
    { label: 'ปัญหาค้าง', value: '7', icon: 'support_agent' },
    { label: 'สัญญาใกล้หมดอายุ', value: '3', icon: 'handshake' },
  ];

  readonly quickLinks = computed(() => {
    const codes = new Set(this.auth.getVisibleMenuCodes());
    return MENU_ITEMS.filter(
      (m: MenuItem) => codes.has(m.code) && m.code !== 'dashboard'
    ).slice(0, 6);
  });
}
