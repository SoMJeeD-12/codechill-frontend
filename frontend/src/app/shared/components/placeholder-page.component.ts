import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [MatCardModule, MatIconModule],
  template: `
    <mat-card class="placeholder">
      <mat-icon>{{ data().icon || 'construction' }}</mat-icon>
      <h1>{{ data().title || 'กำลังพัฒนา' }}</h1>
      <p>{{ data().description || 'หน้านี้จะพร้อมใช้งานในเฟสถัดไป' }}</p>
      <p class="phase">จะพัฒนาในเฟสถัดไป · ตอนนี้เป็นหน้า placeholder</p>
    </mat-card>
  `,
  styles: `
    .placeholder {
      max-width: 640px;
      padding: 2rem;
      border-radius: 14px;
      text-align: center;
    }
    mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #0f766e;
    }
    h1 {
      margin: 0.75rem 0 0.35rem;
      font-size: 1.5rem;
    }
    p {
      margin: 0;
      color: #5b6762;
      line-height: 1.5;
    }
    .phase {
      margin-top: 1rem;
      font-size: 0.85rem;
      color: #0f766e;
      font-weight: 500;
    }
  `,
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly data = toSignal(
    this.route.data.pipe(
      map((d) => ({
        title: String(d['title'] ?? ''),
        description: String(d['description'] ?? ''),
        icon: String(d['icon'] ?? 'construction'),
      }))
    ),
    {
      initialValue: {
        title: '',
        description: '',
        icon: 'construction',
      },
    }
  );
}
