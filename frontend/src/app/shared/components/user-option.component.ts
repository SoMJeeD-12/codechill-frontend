import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AvatarService } from '../../core/services/avatar.service';
import { UserService } from '../../core/services/user.service';

const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
const THAI_LEADING_VOWELS = /^[\u0E40-\u0E44]+/;

/**
 * แถวคนใน mat-option — รูป + ชื่อ + ตำแหน่ง/บทบาท
 * mat-select เอา textContent ของ option ไปโชว์ในช่องที่เลือก → อักษรย่อกับตำแหน่งต้องมาจาก
 * CSS content: attr(...) เท่านั้น ข้อความจริงในแถวมีแค่ชื่อ
 */
@Component({
  selector: 'app-user-option',
  standalone: true,
  template: `
    <span class="uo-avatar" [attr.data-initials]="src() ? null : initials()" aria-hidden="true">
      @if (src(); as s) {
        <img [src]="s" alt="" (error)="src.set(null)" />
      }
    </span>
    <span class="uo-body">
      <span class="uo-name">{{ name() }}</span>
      @if (meta()) {
        <span class="uo-meta" [attr.data-meta]="meta()" aria-hidden="true"></span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      min-width: 0;
      max-width: 100%;
      padding: 0.2rem 0;
      vertical-align: middle;
    }
    .uo-avatar {
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      overflow: clip;
      background: linear-gradient(145deg, var(--app-hero-from), var(--app-hero-to));
      color: var(--app-hero-ink);
      font-size: 0.7rem;
      font-weight: 600;
      line-height: 1;
      &::before { content: attr(data-initials); }
      img { width: 100%; height: 100%; object-fit: cover; }
    }
    .uo-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
    .uo-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .uo-meta {
      color: var(--app-muted);
      font-size: 0.74rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      &::before { content: attr(data-meta); }
    }
  `,
})
export class UserOptionComponent {
  private readonly usersApi = inject(UserService);
  private readonly avatars = inject(AvatarService);

  readonly userId = input.required<number>();
  readonly name = input<string | null | undefined>('');

  private readonly profile = computed(() => {
    const id = this.userId();
    return this.usersApi.users().find((u) => u.id === id) ?? null;
  });

  readonly meta = computed(() => {
    const p = this.profile();
    const parts = [p?.position, p?.roles?.[0]?.name].filter((v): v is string => !!v?.trim());
    return parts.filter((v, i) => parts.indexOf(v) === i).join(' · ');
  });

  readonly initials = computed(() => {
    const text = (this.name() ?? '').replace(THAI_MARKS, '').trim();
    if (!text) {
      return '?';
    }
    const parts = text.split(/\s+/).map((p) => p.replace(THAI_LEADING_VOWELS, '') || p);
    const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return ((parts[0]?.[0] ?? '') + second).toUpperCase();
  });

  private readonly avatarUrl = computed(() => this.profile()?.avatarUrl ?? null);
  readonly src = signal<string | null>(null);

  constructor() {
    this.usersApi.ensureProfiles();
    effect((onCleanup) => {
      const url = this.avatarUrl();
      this.src.set(null);
      const sub = this.avatars.src(url).subscribe((s) => this.src.set(s));
      onCleanup(() => sub.unsubscribe());
    });
  }
}
