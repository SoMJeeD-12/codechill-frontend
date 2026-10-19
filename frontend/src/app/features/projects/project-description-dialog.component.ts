import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ProjectDescriptionDialogData {
  name: string;
  code: string | null;
  customerName: string | null;
  status: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  description: string;
}

export function openProjectDescription(dialog: MatDialog, data: ProjectDescriptionDialogData): void {
  dialog.open(ProjectDescriptionDialogComponent, {
    width: '640px',
    maxWidth: '94vw',
    maxHeight: '90vh',
    autoFocus: 'dialog',
    data,
  });
}

@Component({
  selector: 'app-project-description-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="head">
      <span class="head__icon"><mat-icon>description</mat-icon></span>
      <div class="head__text">
        <span class="kicker">รายละเอียดโปรเจกต์</span>
        <h2>{{ data.name }}</h2>
        <p class="meta">
          @if (data.customerName) {
            {{ data.customerName }}
          }
        </p>
      </div>
      <button mat-icon-button type="button" mat-dialog-close aria-label="ปิด" class="head__close">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content>
      <div class="badges">
        <span
          class="status project-status-badge"
          [attr.data-status]="data.status"
          [attr.data-project-status]="data.status"
        >
          {{ data.statusLabel }}
        </span>
        <span class="priority-badge" [attr.data-priority]="data.priority">
          {{ data.priorityLabel }}
        </span>
      </div>
      <div class="body">{{ data.description }}</div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" mat-dialog-close>ปิด</button>
    </mat-dialog-actions>
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
      padding: 1.25rem 1.25rem 0.5rem 1.5rem;
    }
    .head__icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 2.6rem;
      height: 2.6rem;
      border-radius: 0.8rem;
      background: var(--app-accent-soft);
      color: var(--app-accent);
    }
    .head__text {
      flex: 1;
      min-width: 0;
    }
    .kicker {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: var(--app-accent);
    }
    h2 {
      margin: 0.1rem 0 0;
      font-size: 1.3rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--app-ink);
      overflow-wrap: anywhere;
    }
    .meta {
      margin: 0.2rem 0 0;
      font-size: 0.85rem;
      color: var(--app-muted);
    }
    .head__close {
      flex: none;
      margin: -0.35rem -0.5rem 0 0;
      color: var(--app-muted);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.85rem;
    }
    .body {
      padding: 1rem 1.15rem;
      border-radius: 0.85rem;
      border: 1px solid var(--app-line);
      background: var(--app-surface-2);
      color: var(--app-ink);
      font-size: 0.95rem;
      line-height: 1.75;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class ProjectDescriptionDialogComponent {
  readonly data = inject<ProjectDescriptionDialogData>(MAT_DIALOG_DATA);
}
