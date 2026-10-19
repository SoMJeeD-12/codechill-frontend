import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import {
  FollowUp,
  followUpCarriedResult,
  followUpDisplayStatus,
} from '../../core/models/follow-up.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { UserService } from '../../core/services/user.service';
import { addDays, toDateOnlyString } from '../../core/utils/date.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { ListPage, ListRequest, createServerList } from '../../shared/utils/server-list';
import { CustomerRecordPreviewDialogComponent } from '../customers/customer-record-preview-dialog.component';
import { EMPTY, Observable } from 'rxjs';
import { expand, map, reduce, skip, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavAttentionService } from '../../core/services/nav-attention.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { FollowUpCompleteFlowService } from './follow-up-complete-dialog.component';

/** 'today' = ใกล้ครบกำหนด (คง id เดิมไว้ — ลิงก์เมนูใช้ ?view=today) */
type FollowUpView = 'all' | 'today' | 'overdue' | 'planned' | 'carried';

const CARRIED_FETCH_LIMIT = 100;
const CARRIED_MAX_PAGES = 10;

const DUE_SOON_DAYS = 5;

/** งานของฉันที่ยังเปิด ครบกำหนดวันนี้ถึงอีก DUE_SOON_DAYS วัน (ไม่รวมที่เลยกำหนด) */
function dueSoonRange(): { status: 'PLANNED'; dueFrom: string; dueTo: string } {
  const today = new Date();
  return {
    status: 'PLANNED',
    dueFrom: toDateOnlyString(today),
    dueTo: toDateOnlyString(addDays(today, DUE_SOON_DAYS)),
  };
}

import { FollowUpFormDialogComponent, FollowUpFormPreset } from './follow-up-form-dialog.component';

export {
  FollowUpFormDialogComponent,
  type FollowUpFormDialogData,
  type FollowUpFormPreset,
} from './follow-up-form-dialog.component';

@Component({
  selector: 'app-follow-ups-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatMenuModule,
    RowActionsComponent,
    TablePaginatorComponent,
    ListLoadingBarComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './follow-ups-page.component.html',
  styleUrl: './follow-ups-page.component.scss',
})
export class FollowUpsPageComponent implements OnInit {
  readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attention = inject(NavAttentionService);
  private readonly completeFlow = inject(FollowUpCompleteFlowService);
  private readonly notificationInbox = inject(NotificationInboxService);

  /** GET /follow-ups?page&limit&search&(overdue|status|assignedUserId|dueFrom|dueTo)&sortBy — แบ่งหน้าฝั่ง server */
  readonly list = createServerList<FollowUp, { view: FollowUpView }>({
    namespace: 'follow-ups',
    filters: { view: 'all' },
    sortBy: 'dueDate',
    sortOrder: 'ASC',
    fetch: ({ filters, ...req }) => {
      const me = this.auth.currentUser();
      const view = filters.view;
      if (view === 'carried') {
        return this.loadCarriedPage(req);
      }
      const request = this.api.listPage({
        ...req,
        overdue: view === 'overdue' ? true : undefined,
        status: view === 'planned' ? 'PLANNED' : undefined,
        assignedUserId: view === 'today' && me ? me.id : undefined,
        ...(view === 'today' ? dueSoonRange() : {}),
      });
      if (view !== 'today' || req.search) {
        return request;
      }
      return request.pipe(tap((page) => this.dueSoonCount.set(page.total)));
    },
  });
  readonly dueSoonDays = DUE_SOON_DAYS;
  readonly dueSoonCount = signal(0);

  constructor() {
    // คลิกเมนู (มี badge) ขณะอยู่หน้านี้ — component เดิม ต้องตาม query เอง
    this.route.queryParamMap.pipe(skip(1), takeUntilDestroyed()).subscribe((q) => {
      if (q.get('view') === 'today' && this.view() !== 'today') {
        this.list.setFilter('view', 'today');
      }
      this.openEditFromQuery(q.get('edit'));
      this.openDetailFromQuery(q.get('open'));
    });
  }

  /** ?edit=:id — มาจากกล่องปิดงาน (งานเก่ายังไม่ผูกโปรเจกต์) */
  private openEditFromQuery(raw: string | null): void {
    this.openFromQuery('edit', raw, (row) => this.openCreate(row));
  }

  /** ?open=:id — มาจากกระดิ่งแจ้งเตือน (refType FOLLOW_UP) */
  private openDetailFromQuery(raw: string | null): void {
    this.openFromQuery('open', raw, (row) => this.openFollowUpDetail(row));
  }

  private openFromQuery(key: 'edit' | 'open', raw: string | null, open: (row: FollowUp) => void): void {
    const id = Number(raw);
    if (!raw || !Number.isInteger(id) || id <= 0) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.api.get(id).subscribe({
      next: open,
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }
  readonly items = this.list.items;
  readonly loading = this.list.loading;
  readonly view = computed(() => this.list.filters().view);
  readonly searchControl = this.list.searchControl;
  readonly columns = [
    'title',
    'project',
    'customer',
    'dueDate',
    'daysLeft',
    'assignee',
    'status',
    'actions',
  ];

  readonly canCreate = computed(() => this.auth.hasPermission('follow-ups', 'create'));
  readonly canUpdate = computed(() => this.auth.hasPermission('follow-ups', 'update'));
  readonly canComplete = this.completeFlow.canComplete;
  readonly canDelete = computed(() => this.auth.hasPermission('follow-ups', 'delete'));

  ngOnInit(): void {
    // follow-up ไม่ใช่ TASK/TICKET — ใช้ TASK เป็นรายชื่อพนักงาน ACTIVE ที่มอบหมายงานได้
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe();
    this.loadDueSoonCount();
    this.openEditFromQuery(this.route.snapshot.queryParamMap.get('edit'));
    this.openDetailFromQuery(this.route.snapshot.queryParamMap.get('open'));

    // เข้ามาจากการ์ด "ติดตามที่เลยกำหนด" บนหน้าแรก
    if (this.route.snapshot.queryParamMap.get('overdue') === 'true') {
      this.list.patchFilters({ view: 'overdue' });
      return;
    }
    this.list.start();
  }

  setView(view: FollowUpView): void {
    this.list.setFilter('view', view);
  }

  /**
   * backend ไม่มี filter "นัดต่อ" และ search ไม่ค้นใน detail — ดึงงานที่ยังติดตามอยู่ทั้งหมด
   * (ทีละ CARRIED_FETCH_LIMIT) แล้วกรอง/แบ่งหน้าฝั่ง frontend
   */
  private loadCarriedPage(
    req: Omit<ListRequest<{ view: FollowUpView }>, 'filters'>
  ): Observable<ListPage<FollowUp>> {
    const base = {
      status: 'PLANNED' as const,
      search: req.search,
      sortBy: req.sortBy,
      sortOrder: req.sortOrder,
      limit: CARRIED_FETCH_LIMIT,
    };
    return this.api.listPage({ ...base, page: 1 }).pipe(
      expand((page, i) =>
        (i + 1) * CARRIED_FETCH_LIMIT < page.total && i + 1 < CARRIED_MAX_PAGES
          ? this.api.listPage({ ...base, page: i + 2 })
          : EMPTY
      ),
      reduce((all, page) => all.concat(page.items), [] as FollowUp[]),
      map((all) => {
        const carried = all.filter((f) => followUpCarriedResult(f) !== null);
        const start = (req.page - 1) * req.limit;
        return { items: carried.slice(start, start + req.limit), total: carried.length };
      })
    );
  }

  private loadDueSoonCount(): void {
    const me = this.auth.currentUser();
    if (!me) {
      return;
    }
    this.api
      .listPage({ page: 1, limit: 1, assignedUserId: me.id, ...dueSoonRange() })
      .subscribe({
        next: (page) => this.dueSoonCount.set(page.total),
        error: () => undefined,
      });
  }

  toggleSort(key: string): void {
    this.list.toggleSort(key);
  }

  sortIcon(key: string): string {
    return this.list.sortIcon(key);
  }

  reload(): void {
    this.list.reload({ invalidate: true });
  }

  customerName(f: FollowUp): string {
    return f.customer?.name ?? this.customersApi.getCustomer(f.customerId)?.name ?? `#${f.customerId}`;
  }

  projectLabel(f: FollowUp): string {
    if (f.project?.name) {
      return f.project.name;
    }
    if (f.projectId == null) {
      return '—';
    }
    return `#${f.projectId}`;
  }

  projectName(f: FollowUp): string {
    if (f.project?.name) {
      return f.project.name;
    }
    return f.projectId == null ? '—' : `#${f.projectId}`;
  }

  userName(f: FollowUp): string {
    if (f.assignedUser?.fullName) {
      return f.assignedUser.fullName;
    }
    if (!f.assignedUserId) {
      return '—';
    }
    return this.usersApi.getById(f.assignedUserId)?.fullName ?? `#${f.assignedUserId}`;
  }

  followUpTip(f: FollowUp): string {
    const parts = [f.title];
    if (f.detail?.trim()) {
      parts.push(f.detail.trim());
    }
    if (f.resultNote?.trim()) {
      parts.push(`ผล: ${f.resultNote.trim()}`);
    }
    return parts.join(' — ');
  }

  statusLabel(f: FollowUp): string {
    return followUpDisplayStatus(f);
  }

  carriedResult(f: FollowUp): string | null {
    return followUpCarriedResult(f);
  }

  daysLeftLabel(f: FollowUp): string {
    if (f.status === 'DONE') {
      return 'เสร็จแล้ว';
    }
    if (f.status === 'CANCELLED') {
      return '—';
    }
    const days = this.api.daysUntilDue(f);
    if (days === null) {
      return '—';
    }
    if (days < 0) {
      return `เลยมา ${Math.abs(days)} วัน`;
    }
    if (days === 0) {
      return 'ครบวันนี้';
    }
    return `เหลือ ${days} วัน`;
  }

  daysLeftClass(f: FollowUp): string {
    if (f.status === 'DONE' || f.status === 'CANCELLED') {
      return '';
    }
    if (this.api.isOverdue(f)) {
      return 'overdue';
    }
    const days = this.api.daysUntilDue(f);
    if (days !== null && days <= 3) {
      return 'soon';
    }
    return '';
  }

  openCreate(row?: FollowUp, preset?: FollowUpFormPreset): void {
    if (row ? !this.canUpdate() : !this.canCreate()) {
      this.snack.open('คุณไม่มีสิทธิ์ดำเนินการนี้', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(FollowUpFormDialogComponent, {
      ...FORM_DIALOG,
      data: row ?? preset ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  openFollowUpDetail(row: FollowUp): void {
    this.notificationInbox.markReadByRef('FOLLOW_UP', row.id);
    const carried = this.carriedResult(row);
    this.dialog.open(CustomerRecordPreviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        title: 'รายละเอียดงานติดตาม',
        heading: row.title,
        meta: this.statusLabel(row),
        fields: [
          {
            label: 'โปรเจกต์',
            value: row.projectId
              ? this.projectLabel(row)
              : 'ยังไม่ได้ผูกโปรเจกต์ — กด「แก้ไข」เพื่อเลือกโปรเจกต์ให้งานนี้',
            full: true,
          },
          carried !== null
            ? {
                label: 'แผนต่อจากครั้งก่อน',
                value: `นัดต่อจากงานติดตาม「${row.title}」ครั้งก่อน\nผลครั้งก่อน: ${carried || '—'}`,
                full: true,
              }
            : { label: 'สิ่งที่วางแผนไว้', value: row.detail?.trim() || 'ไม่มีรายละเอียดแผน', full: true },
          { label: 'ผลตอนทำเสร็จ', value: row.resultNote?.trim() || 'ยังไม่มีผล', full: true },
        ],
      },
    });
  }

  followUpRowActions(row: FollowUp): RowAction[] {
    const actions: RowAction[] = [
      { label: 'รายละเอียด', icon: 'visibility', run: () => this.openFollowUpDetail(row) },
    ];
    if (row.status === 'PLANNED' && this.canComplete()) {
      actions.push({ label: 'เสร็จแล้ว', primary: true, icon: 'task_alt', run: () => this.markDone(row) });
    }
    if (this.canUpdate()) {
      actions.push({ label: 'แก้ไข', icon: 'edit', run: () => this.openCreate(row) });
    }
    if (this.canDelete()) {
      actions.push({ label: 'ลบ', icon: 'delete', danger: true, run: () => this.remove(row) });
    }
    return actions;
  }

  markDone(row: FollowUp): void {
    this.completeFlow.open(row).subscribe((result) => {
      if (result) {
        this.reload();
      }
    });
  }

  remove(row: FollowUp): void {
    if (!this.canDelete()) {
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบงานติดตาม',
      message: `ต้องการลบงานติดตาม「${row.title}」หรือไม่?`,
      confirmLabel: 'ลบงานติดตาม',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }
}
