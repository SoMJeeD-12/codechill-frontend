import { Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_REF_LABELS,
  Attachment,
  AttachmentRefType,
  formatAttachmentSize,
} from '../../core/models/attachment.model';
import { AuthService } from '../../core/services/auth.service';
import { AttachmentService } from '../../core/services/attachment.service';
import { openConfirmDialog } from './confirm-dialog.component';
import { ThaiDatePipe } from '../pipes/thai-date.pipe';

/**
 * รายการไฟล์แนบตาม refType + refId — GET/POST/DELETE /api/attachments
 * ไม่ใช้กับเอกสารโปรเจค
 */
@Component({
  selector: 'app-entity-attachments',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    ThaiDatePipe,
  ],
  templateUrl: './entity-attachments.component.html',
  styleUrl: './entity-attachments.component.scss',
})
export class EntityAttachmentsComponent {
  private readonly api = inject(AttachmentService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly refType = input.required<AttachmentRefType>();
  readonly refId = input.required<number>();
  /** หัวข้อแผง — ค่าว่างใช้ตามประเภท */
  readonly heading = input<string | null>(null);

  readonly accept = ATTACHMENT_ACCEPT;
  readonly items = signal<Attachment[]>([]);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly downloadingId = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.refType();
      this.refId();
      this.auth.session();
      this.reload();
    });
  }

  canView(): boolean {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('file.view') ||
      this.auth.hasPermissionCode('file.download')
    );
  }

  canUpload(): boolean {
    this.auth.session();
    return this.auth.hasPermissionCode('file.upload');
  }

  canDelete(): boolean {
    this.auth.session();
    return this.auth.hasPermissionCode('file.delete');
  }

  canEditNote(): boolean {
    this.auth.session();
    return this.auth.hasPermissionCode('file.upload');
  }

  panelTitle(): string {
    return this.heading()?.trim() || ATTACHMENT_REF_LABELS[this.refType()];
  }

  formatSize(bytes: number | null): string {
    return formatAttachmentSize(bytes);
  }

  reload(): void {
    const id = Number(this.refId()) || 0;
    if (!id || !this.canView()) {
      this.items.set([]);
      this.loading.set(false);
      this.error.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.list({ refType: this.refType(), refId: id }).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.items.set([]);
        this.loading.set(false);
        this.error.set(err.message || 'โหลดไฟล์แนบไม่สำเร็จ');
      },
    });
  }

  onFilePicked(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0] ?? null;
    inputEl.value = '';
    if (!file || !this.canUpload()) {
      return;
    }
    const refId = Number(this.refId()) || 0;
    if (!refId) {
      this.snack.open('ยังไม่มีรหัสอ้างอิงสำหรับแนบไฟล์', 'ปิด', { duration: 3000 });
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      this.snack.open('ไฟล์ใหญ่เกิน 20 MB', 'ปิด', { duration: 3500 });
      return;
    }
    this.uploading.set(true);
    this.api.upload({ file, refType: this.refType(), refId }).subscribe({
      next: (row) => {
        this.uploading.set(false);
        this.items.update((list) => [row, ...list.filter((x) => x.id !== row.id)]);
        this.snack.open('อัปโหลดไฟล์แล้ว', 'ปิด', { duration: 2500 });
      },
      error: (err: Error) => {
        this.uploading.set(false);
        this.snack.open(err.message || 'อัปโหลดไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  download(row: Attachment): void {
    if (!this.canView()) {
      return;
    }
    this.downloadingId.set(row.id);
    this.api.download(row).subscribe({
      next: () => this.downloadingId.set(null),
      error: (err: Error) => {
        this.downloadingId.set(null);
        this.snack.open(err.message || 'ดาวน์โหลดไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  editNote(row: Attachment): void {
    if (!this.canEditNote()) {
      return;
    }
    const next = window.prompt('หมายเหตุไฟล์แนบ', row.note ?? '');
    if (next == null) {
      return;
    }
    this.api.update(row.id, { note: next.trim() || null }).subscribe({
      next: (updated) => {
        this.items.update((list) =>
          list.map((x) => (x.id === updated.id ? updated : x))
        );
        this.snack.open('บันทึกหมายเหตุแล้ว', 'ปิด', { duration: 2200 });
      },
      error: (err: Error) =>
        this.snack.open(err.message || 'แก้หมายเหตุไม่สำเร็จ', 'ปิด', { duration: 3500 }),
    });
  }

  remove(row: Attachment): void {
    if (!this.canDelete()) {
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบไฟล์แนบ',
      message: `ลบ「${row.fileName}」ออกจากรายการนี้หรือไม่? (ไฟล์ในที่เก็บยังอยู่)`,
      confirmLabel: 'ลบออกจากรายการ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.items.update((list) => list.filter((x) => x.id !== row.id));
          this.snack.open('ลบออกจากรายการแล้ว', 'ปิด', { duration: 2500 });
        },
        error: (err: Error) =>
          this.snack.open(err.message || 'ลบไม่สำเร็จ', 'ปิด', { duration: 3500 }),
      });
    });
  }
}
