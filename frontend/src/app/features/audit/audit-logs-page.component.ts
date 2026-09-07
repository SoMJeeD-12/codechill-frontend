import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AuditAction,
  AuditEntityType,
  AuditLog,
} from '../../core/models/audit.model';
import { AuditService } from '../../core/services/audit.service';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './audit-logs-page.component.html',
  styleUrl: './audit-logs-page.component.scss',
})
export class AuditLogsPageComponent implements OnInit {
  private readonly api = inject(AuditService);

  readonly logs = signal<AuditLog[]>([]);
  readonly actionFilter = signal<AuditAction | 'ALL'>('ALL');
  readonly entityFilter = signal<AuditEntityType | 'ALL'>('ALL');
  readonly columns = ['createdAt', 'actor', 'action', 'entity', 'summary'];

  readonly actions = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];
  readonly entities = Object.keys(AUDIT_ENTITY_LABELS) as AuditEntityType[];
  readonly actionLabels = AUDIT_ACTION_LABELS;
  readonly entityLabels = AUDIT_ENTITY_LABELS;

  readonly filtered = computed(() => {
    const action = this.actionFilter();
    const entity = this.entityFilter();
    return this.logs().filter((row) => {
      if (action !== 'ALL' && row.action !== action) {
        return false;
      }
      if (entity !== 'ALL' && row.entityType !== entity) {
        return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe((list) => this.logs.set(list));
  }

  actionLabel(action: AuditAction): string {
    return this.actionLabels[action];
  }

  entityLabel(entity: AuditEntityType): string {
    return this.entityLabels[entity];
  }
}
