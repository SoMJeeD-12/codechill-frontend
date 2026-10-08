import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable, concat, toArray } from 'rxjs';
import { ApiEnvelopeService } from '../../core/http/api-envelope.service';
import { AuthService } from '../../core/services/auth.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';

export interface ProfileEditDialogData {
  username: string;
  fullName: string;
  nickname: string | null;
  avatarUrl: string | null;
}

const NICKNAME_MAX = 50;
const FULL_NAME_MAX = 255;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** เลือกได้ใหญ่กว่า 2 MB — ย่อบนเครื่องก่อนส่ง เพราะ BE รับไม่เกิน 2 MB */
const PICK_MAX_BYTES = 20 * 1024 * 1024;
const AVATAR_MAX_SIDE = 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** ย่อด้านยาวสุดเหลือ 1024px แล้วลดคุณภาพจนไม่เกิน maxBytes */
async function shrinkImage(file: File, maxBytes: number): Promise<File> {
  const img = await loadImage(file);
  let side = AVATAR_MAX_SIDE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      break;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      let blob = await canvasBlob(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') {
        blob = await canvasBlob(canvas, 'image/jpeg', quality);
      }
      if (blob && blob.size <= maxBytes && AVATAR_TYPES.includes(blob.type)) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        const base = file.name.replace(/\.[^.]+$/, '') || 'avatar';
        return new File([blob], `${base}.${ext}`, { type: blob.type });
      }
    }
    side = Math.round(side * 0.75);
  }
  throw new Error('too-large');
}

@Component({
  selector: 'app-profile-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    UserAvatarComponent,
  ],
  template: `
    <h2 mat-dialog-title>แก้ไขโปรไฟล์</h2>
    <mat-dialog-content>
      <div class="avatar-row">
        @if (localPreview(); as src) {
          <img class="avatar-preview" [src]="src" alt="รูปใหม่" />
        } @else {
          <app-user-avatar
            [url]="removeAvatar() ? null : data.avatarUrl"
            [name]="data.fullName"
            [size]="88"
          />
        }
        <div class="avatar-actions">
          <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="saving() || processing()">
            <mat-icon>photo_camera</mat-icon>
            {{ processing() ? 'กำลังย่อรูป…' : 'เลือกรูป' }}
          </button>
          @if (file() || removeAvatar()) {
            <button mat-button type="button" (click)="resetAvatar()" [disabled]="saving()">คงรูปเดิม</button>
          } @else if (data.avatarUrl) {
            <button mat-button type="button" class="danger" (click)="markRemove()" [disabled]="saving()">
              ลบรูป
            </button>
          }
          <p class="hint">
            @if (removeAvatar()) {
              จะลบรูปเมื่อกดบันทึก
            } @else {
              JPG / PNG / WEBP · ไฟล์ใหญ่กว่า 2 MB ระบบจะย่อให้อัตโนมัติ
            }
          </p>
          <input #fileInput type="file" hidden [accept]="acceptTypes" (change)="onFile($event)" />
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()">
        <div class="readonly-field">
          <span class="readonly-field__label">ชื่อผู้ใช้</span>
          <span class="readonly-field__value">{{ data.username }}</span>
          <span class="readonly-field__hint">ใช้เข้าสู่ระบบ — แก้ไขไม่ได้</span>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="full">
          <mat-label>ชื่อ-นามสกุล</mat-label>
          <input matInput formControlName="fullName" required [maxlength]="fullNameMax" autocomplete="name" />
          @if (form.controls.fullName.touched && form.controls.fullName.invalid) {
            <mat-error>กรุณากรอกชื่อ-นามสกุล</mat-error>
          } @else {
            <mat-hint align="end">{{ form.controls.fullName.value.length }} / {{ fullNameMax }}</mat-hint>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="full">
          <mat-label>ชื่อเล่น</mat-label>
          <input matInput formControlName="nickname" [maxlength]="nicknameMax" autocomplete="nickname" />
          <mat-hint align="end">{{ form.controls.nickname.value.length }} / {{ nicknameMax }}</mat-hint>
        </mat-form-field>
      </form>

      @if (error(); as err) {
        <p class="error">{{ err }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="saving() || processing() || !dirty()">
        {{ saving() ? 'กำลังบันทึก…' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .avatar-row { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
    .avatar-preview { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
    .avatar-actions { display: flex; flex-wrap: wrap; gap: 0.35rem 0.5rem; align-items: center; }
    .hint { flex-basis: 100%; margin: 0; font-size: 0.8rem; color: var(--app-muted); }
    .danger { color: var(--app-danger); }
    .full { width: 100%; }
    form { display: grid; gap: 0.9rem; }
    .readonly-field { display: grid; gap: 0.1rem; padding: 0.55rem 0.8rem; border-radius: 10px; background: var(--app-surface-2); border: 1px solid var(--app-line); }
    .readonly-field__label { font-size: 0.76rem; color: var(--app-muted); }
    .readonly-field__value { font-weight: 600; color: var(--app-ink); }
    .readonly-field__hint { font-size: 0.74rem; color: var(--app-subtle); }
    .error { margin: 0.75rem 0 0; color: var(--app-danger); font-size: 0.9rem; }
  `,
})
export class ProfileEditDialogComponent implements OnDestroy {
  readonly data = inject<ProfileEditDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ProfileEditDialogComponent, string | true>);
  private readonly auth = inject(AuthService);
  private readonly envelope = inject(ApiEnvelopeService);

  readonly acceptTypes = AVATAR_TYPES.join(',');
  readonly nicknameMax = NICKNAME_MAX;
  readonly fullNameMax = FULL_NAME_MAX;
  readonly form = inject(FormBuilder).nonNullable.group({
    fullName: [
      this.data.fullName ?? '',
      [Validators.required, Validators.maxLength(FULL_NAME_MAX), Validators.pattern(/\S/)],
    ],
    nickname: [this.data.nickname ?? '', [Validators.maxLength(NICKNAME_MAX)]],
  });
  readonly file = signal<File | null>(null);
  readonly localPreview = signal<string | null>(null);
  readonly removeAvatar = signal(false);
  readonly saving = signal(false);
  readonly processing = signal(false);
  readonly error = signal<string | null>(null);

  dirty(): boolean {
    return !!this.file() || this.removeAvatar() || this.nicknameChanged() || this.fullNameChanged();
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (!picked) {
      return;
    }
    if (!AVATAR_TYPES.includes(picked.type)) {
      this.error.set('รูปโปรไฟล์ต้องเป็นไฟล์ JPG, PNG หรือ WEBP เท่านั้น');
      return;
    }
    if (picked.size > PICK_MAX_BYTES) {
      this.error.set('ไฟล์ใหญ่เกินไป (เลือกได้ไม่เกิน 20 MB)');
      return;
    }
    this.error.set(null);
    if (picked.size <= AVATAR_MAX_BYTES) {
      this.useFile(picked);
      return;
    }
    this.processing.set(true);
    shrinkImage(picked, AVATAR_MAX_BYTES)
      .then((small) => this.useFile(small))
      .catch(() => this.error.set('ย่อรูปไม่สำเร็จ — ลองเลือกรูปอื่นที่ไม่เกิน 2 MB'))
      .finally(() => this.processing.set(false));
  }

  private useFile(file: File): void {
    this.setPreview(URL.createObjectURL(file));
    this.file.set(file);
    this.removeAvatar.set(false);
  }

  markRemove(): void {
    this.resetAvatar();
    this.removeAvatar.set(true);
  }

  resetAvatar(): void {
    this.setPreview(null);
    this.file.set(null);
    this.removeAvatar.set(false);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.dirty() || this.saving()) {
      return;
    }
    const steps: Observable<void>[] = [];
    const patch: { fullName?: string; nickname?: string | null } = {};
    if (this.fullNameChanged()) {
      patch.fullName = this.fullNameValue();
    }
    if (this.nicknameChanged()) {
      patch.nickname = this.nicknameValue() || null;
    }
    if (Object.keys(patch).length) {
      steps.push(this.auth.updateMyProfile(patch));
    }
    const file = this.file();
    if (file) {
      steps.push(this.auth.uploadMyAvatar(file));
    } else if (this.removeAvatar()) {
      steps.push(this.auth.deleteMyAvatar());
    }
    this.saving.set(true);
    this.error.set(null);
    concat(...steps)
      .pipe(toArray())
      .subscribe({
        next: () => this.ref.close(this.envelope.takeMessage() ?? true),
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  ngOnDestroy(): void {
    this.setPreview(null);
  }

  private fullNameValue(): string {
    return this.form.controls.fullName.value.trim();
  }

  private fullNameChanged(): boolean {
    return this.fullNameValue() !== (this.data.fullName ?? '').trim();
  }

  private nicknameValue(): string {
    return this.form.controls.nickname.value.trim();
  }

  private nicknameChanged(): boolean {
    return this.nicknameValue() !== (this.data.nickname ?? '');
  }

  private setPreview(src: string | null): void {
    const prev = this.localPreview();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
    this.localPreview.set(src);
  }
}
