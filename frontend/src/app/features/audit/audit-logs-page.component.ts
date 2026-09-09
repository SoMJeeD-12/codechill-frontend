import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_TABLES,
  AuditAction,
  AuditLog,
  auditTableLabel,
} from '../../core/models/audit.model';
import { AuditService } from '../../core/services/audit.service';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
        ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './audit-logs-page.component.html',
  styleUrl: './audit-logs-page.component.scss',
})
export class AuditLogsPageComponent implements OnInit {
  private readonly api = inject(AuditService);
  private readonly fb = inject(FormBuilder);

  readonly logs = signal<AuditLog[]>([]);
  readonly loading = signal(false);
  readonly actionFilter = signal<AuditAction | 'ALL'>('ALL');
  readonly tableFilter = signal<string | 'ALL'>('ALL');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly columns = ['createdAt', 'actor', 'action', 'table', 'record', 'ip'];

  readonly actions = AUDIT_ACTIONS;
  readonly tables = AUDIT_TABLES;
  readonly actionLabels = AUDIT_ACTION_LABELS;

  ngOnInit(): void {
    this.searchControl.valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      this.search.set(v);
      this.reload();
    });
    this.reload();
  }

  reload(): void {
    const action = this.actionFilter();
    const tableName = this.tableFilter();
    this.loading.set(true);
    this.api
      .list({
        search: this.search().trim() || undefined,
        action: action === 'ALL' ? undefined : action,
        tableName: tableName === 'ALL' ? undefined : tableName,
      })
      .subscribe({
        next: (list) => {
          this.logs.set(list);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  setActionFilter(action: AuditAction | 'ALL'): void {
    this.actionFilter.set(action);
    this.reload();
  }

  setTableFilter(tableName: string | 'ALL'): void {
    this.tableFilter.set(tableName);
    this.reload();
  }

  actionLabel(action: AuditAction): string {
    return this.actionLabels[action] ?? action;
  }

  tableLabel(tableName: string): string {
    return auditTableLabel(tableName);
  }

  actorName(log: AuditLog): string {
    return log.user?.fullName ?? (log.userId != null ? `#${log.userId}` : 'ระบบ');
  }

  changeSummary(log: AuditLog): string {
    const fields = changedFields(log.oldValue, log.newValue);
    if (!fields.length) {
      return '—';
    }
    return fields.slice(0, 6).join(', ') + (fields.length > 6 ? ` +${fields.length - 6}` : '');
  }
}

function changedFields(oldValue: unknown, newValue: unknown): string[] {
  const before = asRecord(oldValue);
  const after = asRecord(newValue);
  if (!before && !after) {
    return [];
  }
  if (!before) {
    return Object.keys(after ?? {});
  }
  if (!after) {
    return Object.keys(before);
  }
  return Object.keys({ ...before, ...after }).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
