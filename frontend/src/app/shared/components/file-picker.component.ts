import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * ช่องเลือกไฟล์ที่ใช้ร่วมกัน — ไม่โชว์ปุ่ม Choose File ของเบราว์เซอร์
 */
@Component({
  selector: 'app-file-picker',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <label
      class="file-drop"
      [class.has-file]="!!fileName"
      [class.is-drag]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <input
        #fileInput
        class="file-drop__input"
        type="file"
        [accept]="accept"
        [attr.aria-label]="label"
        (change)="onInput($event)"
      />
      <span class="file-drop__icon" aria-hidden="true">
        <mat-icon>{{ fileName ? 'description' : 'upload_file' }}</mat-icon>
      </span>
      <span class="file-drop__copy">
        <strong>{{ fileName || label }}</strong>
        <small>
          @if (fileName) {
            คลิกหรือวางเพื่อเปลี่ยนไฟล์
          } @else if (currentName) {
            ไฟล์ปัจจุบัน {{ currentName }}
          } @else {
            {{ hint }}
          }
        </small>
      </span>
      @if (fileName) {
        <button type="button" class="file-drop__clear" (click)="clear($event, fileInput)">
          ล้าง
        </button>
      }
    </label>
  `,
  styles: `
    .file-drop {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      min-height: 4.25rem;
      margin: 0.15rem 0 0.35rem;
      padding: 0.75rem 0.9rem;
      border: 1.5px dashed #9db8b2;
      border-radius: 12px;
      background: #f7fbfa;
      color: #134e4a;
      cursor: pointer;
      box-sizing: border-box;
    }
    .file-drop:hover,
    .file-drop.is-drag,
    .file-drop:focus-within {
      border-color: #0f766e;
      background: #eef7f4;
    }
    .file-drop.has-file {
      border-style: solid;
      border-color: #0f766e;
      background: #fff;
    }
    .file-drop__input {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .file-drop__icon {
      display: grid;
      place-items: center;
      width: 2.4rem;
      height: 2.4rem;
      flex: 0 0 auto;
      border-radius: 10px;
      background: #e7f3f0;
      color: #0f766e;
    }
    .file-drop__copy {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
      flex: 1 1 auto;
      text-align: left;
    }
    strong {
      font-size: 0.92rem;
      font-weight: 650;
      word-break: break-all;
    }
    small {
      color: #5b6762;
      font-size: 0.78rem;
      line-height: 1.35;
    }
    .file-drop__clear {
      flex: 0 0 auto;
      border: 0;
      background: transparent;
      color: #0f766e;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 650;
      cursor: pointer;
    }
  `,
})
export class FilePickerComponent {
  @Input() label = 'เลือกไฟล์';
  @Input() hint = 'คลิกหรือลากไฟล์มาวาง';
  @Input() accept = '';
  @Input() fileName: string | null = '';
  @Input() currentName: string | null = '';
  @Output() picked = new EventEmitter<File | null>();

  readonly dragging = signal(false);

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.picked.emit(input.files?.[0] ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (!file) {
      return;
    }
    if (this.accept && !fileMatchesAccept(file, this.accept)) {
      return;
    }
    this.picked.emit(file);
  }

  clear(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    event.stopPropagation();
    input.value = '';
    this.picked.emit(null);
  }
}

function fileMatchesAccept(file: File, accept: string): boolean {
  const rules = accept
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!rules.length) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) {
      return name.endsWith(rule);
    }
    if (rule.endsWith('/*')) {
      return type.startsWith(rule.slice(0, -1));
    }
    return type === rule;
  });
}
