import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AvatarService } from '../../core/services/avatar.service';

const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
const THAI_LEADING_VOWELS = /^[\u0E40-\u0E44]+/;

/** รูปผู้ใช้ — โหลดผ่าน AvatarService (blob + token) · ไม่มีรูปแสดงอักษรย่อ */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  template: `
    @if (src(); as s) {
      <img [src]="s" [alt]="name() || ''" (error)="src.set(null)" />
    } @else {
      <span class="initials">{{ initials() }}</span>
    }
  `,
  host: {
    class: 'user-avatar',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
    '[attr.aria-hidden]': 'true',
  },
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: 50%;
      background: linear-gradient(145deg, #0f766e, #134e4a);
      color: #ecfdf5;
      font-weight: 600;
      line-height: 1;
      user-select: none;
    }
    img { width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class UserAvatarComponent {
  private readonly avatars = inject(AvatarService);

  readonly url = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>(null);
  readonly size = input(32);

  readonly src = signal<string | null>(null);
  readonly initials = computed(() => {
    const text = (this.name() ?? '').replace(THAI_MARKS, '').trim();
    if (!text) {
      return '?';
    }
    const parts = text.split(/\s+/).map((p) => p.replace(THAI_LEADING_VOWELS, '') || p);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + second).toUpperCase();
  });

  constructor() {
    effect((onCleanup) => {
      const url = this.url();
      this.src.set(null);
      const sub = this.avatars.src(url).subscribe((s) => this.src.set(s));
      onCleanup(() => sub.unsubscribe());
    });
  }
}
