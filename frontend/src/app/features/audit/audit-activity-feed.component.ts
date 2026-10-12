import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DATE_FORMATS } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { THAI_CE_NUMERIC_DATE_FORMATS } from '../../core/date/thai-ce-date-adapter';
import { AUDIT_NOTIFICATION_TABLE, AuditLog } from '../../core/models/audit.model';
import { toDateOnlyString } from '../../core/utils/date.util';
import { UserSummary } from '../../core/models/user.model';
import { AuditService } from '../../core/services/audit.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';
import { CursorFeed } from '../../shared/utils/cursor-feed';

const PAGE_SIZE = 30;
const TZ = 'Asia/Bangkok';

/** ตารางที่มีหน้ารายละเอียด — ป้ายหมวด + recordId เป็นลิงก์ */
const RECORD_ROUTES: Record<string, string> = {
  tickets: '/app/tickets',
  projects: '/app/projects',
  ma_contracts: '/app/ma',
  customers: '/app/customers',
  surveys: '/app/surveys',
};

/** สระบน/ล่าง + วรรณยุกต์ไทย — ไม่นับเป็นตัวอักษรในวงกลมอักษรย่อ */
const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

const AVATAR_TONES = ['#0f766e', '#2563eb', '#9333ea', '#c2410c', '#be123c', '#4d7c0f', '#0369a1'];

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'long' });
const dayFmt = new Intl.DateTimeFormat('th-TH', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const fullFmt = new Intl.DateTimeFormat('th-TH', {
  timeZone: TZ,
  dateStyle: 'full',
  timeStyle: 'medium',
});

interface FeedGroup {
  key: string;
  label: string;
  items: AuditLog[];
}

/** ฟีดกิจกรรม「ใครทำอะไร」จาก GET /audit-logs — ประโยคใช้ summary จาก backend เท่านั้น */
@Component({
  selector: 'app-audit-activity-feed',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    InfiniteScrollDirective,
    UserAvatarComponent,
  ],
  providers: [{ provide: MAT_DATE_FORMATS, useValue: THAI_CE_NUMERIC_DATE_FORMATS }],
  templateUrl: './audit-activity-feed.component.html',
  styleUrl: './audit-activity-feed.component.scss',
})
export class AuditActivityFeedComponent implements OnInit {
  private readonly api = inject(AuditService);
  private readonly auth = inject(AuthService);
  private readonly usersApi = inject(UserService);

  /** ล็อกไว้ที่ผู้ใช้คนเดียว (ซ่อนตัวกรองผู้ใช้) */
  readonly fixedUserId = input<number | null>(null);
  /** ค่าเริ่มต้นของตัวกรองผู้ใช้ เช่น จาก ?userId= */
  readonly initialUserId = input<number | null>(null);

  readonly feed = new CursorFeed<AuditLog>(
    (cursor) => this.api.listCursor(this.filterParams(), cursor),
    (items) => this.rememberTables(items)
  );
  readonly items = this.feed.items;
  readonly total = this.feed.total;
  readonly loading = this.feed.loading;
  readonly loadingMore = this.feed.loadingMore;
  readonly error = this.feed.error;
  readonly hasMore = this.feed.hasMore;
  readonly expandedId = signal<number | null>(null);

  readonly userFilter = signal<number | null>(null);
  readonly tableFilter = signal<string | null>(null);
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly dateRange = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });
  readonly hideSessionEvents = signal(true);
  readonly hideNotifications = signal(true);
  readonly hideSystemEvents = signal(true);

  readonly users = signal<UserSummary[]>([]);
  private readonly tableLabelMap = signal<Record<string, string>>({
    [AUDIT_NOTIFICATION_TABLE]: 'การแจ้งเตือน',
  });
  readonly tableOptions = computed(() =>
    Object.entries(this.tableLabelMap())
      .map(([name, label]) => ({ name, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'))
  );

  readonly groups = computed<FeedGroup[]>(() => {
    const todayKey = dayKeyFmt.format(new Date());
    const yesterdayKey = dayKeyFmt.format(new Date(Date.now() - 86_400_000));
    const out: FeedGroup[] = [];
    for (const log of this.items()) {
      const d = new Date(log.createdAt);
      const key = dayKeyFmt.format(d);
      let group = out[out.length - 1];
      if (!group || group.key !== key) {
        const label =
          key === todayKey
            ? 'วันนี้'
            : key === yesterdayKey
              ? 'เมื่อวาน'
              : `${weekdayFmt.format(d).replace(/^วัน/, '')} ${dayFmt.format(d)}`;
        group = { key, label, items: [] };
        out.push(group);
      }
      group.items.push(log);
    }
    return out;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.feed.destroy());
    this.usersApi.ensureProfiles();
  }

  ngOnInit(): void {
    this.userFilter.set(this.fixedUserId() ?? this.initialUserId());
    if (this.fixedUserId() == null) {
      this.usersApi.listAssignableAll().subscribe({
        next: (list) =>
          this.users.set([...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'th'))),
        error: () => this.users.set([]),
      });
    }
    this.reload();
  }

  reload(): void {
    this.expandedId.set(null);
    this.feed.reset();
  }

  loadMore(): void {
    this.feed.loadMore();
  }

  setUser(id: number | null): void {
    this.userFilter.set(id);
    this.reload();
  }

  setTable(name: string | null): void {
    this.tableFilter.set(name);
    this.reload();
  }

  /** โหลดใหม่เมื่อช่วงเปลี่ยนจริง — ระหว่างเลือกวันแรกในปฏิทินยังไม่ยิงซ้ำ */
  applyDateRange(): void {
    const { start, end } = this.dateRange.value;
    const from = toDateOnlyString(start);
    const to = toDateOnlyString(end);
    if (start && !end && this.dateTo()) {
      return;
    }
    if (from === this.dateFrom() && to === this.dateTo()) {
      return;
    }
    this.dateFrom.set(from);
    this.dateTo.set(to);
    this.reload();
  }

  clearDates(): void {
    this.dateRange.reset({ start: null, end: null });
    this.dateFrom.set('');
    this.dateTo.set('');
    this.reload();
  }

  setHideSessionEvents(value: boolean): void {
    this.hideSessionEvents.set(value);
    this.reload();
  }

  setHideNotifications(value: boolean): void {
    this.hideNotifications.set(value);
    this.reload();
  }

  setHideSystemEvents(value: boolean): void {
    this.hideSystemEvents.set(value);
    this.reload();
  }

  toggle(log: AuditLog): void {
    if (!log.changes?.length) {
      return;
    }
    this.expandedId.update((id) => (id === log.id ? null : log.id));
  }

  private readonly avatarUrls = computed(() => {
    const map = new Map<number, string>();
    for (const u of this.usersApi.users()) {
      if (u.avatarUrl) {
        map.set(u.id, u.avatarUrl);
      }
    }
    const me = this.auth.currentUser();
    if (me?.avatarUrl) {
      map.set(me.id, me.avatarUrl);
    }
    return map;
  });

  avatarUrl(log: AuditLog): string | null {
    return log.user ? (this.avatarUrls().get(log.user.id) ?? null) : null;
  }

  isMe(log: AuditLog): boolean {
    const me = this.auth.currentUser()?.id;
    return log.user != null && me != null && log.user.id === me;
  }

  actorLabel(log: AuditLog): string {
    if (!log.user) {
      return 'ระบบ';
    }
    return this.isMe(log) ? 'คุณ' : log.user.fullName;
  }

  initials(log: AuditLog): string {
    const name = log.user?.fullName?.trim();
    if (!name) {
      return '';
    }
    return Array.from(name.replace(THAI_MARKS, '').replace(/\s+/g, ''))
      .slice(0, 2)
      .join('');
  }

  avatarTone(log: AuditLog): string {
    return log.user ? AVATAR_TONES[log.user.id % AVATAR_TONES.length] : '#94a3b8';
  }

  time(log: AuditLog): string {
    return timeFmt.format(new Date(log.createdAt));
  }

  fullTime(log: AuditLog): string {
    return fullFmt.format(new Date(log.createdAt));
  }

  tableLabel(log: AuditLog): string {
    return log.tableLabel?.trim() || log.tableName;
  }

  /** ชื่อของรายการที่ถูกกระทำ — ไม่โชว์เลข id ภายใน · ไม่รู้ชื่อคืน null */
  recordLabel(log: AuditLog): string | null {
    if (log.recordId == null || log.tableName !== 'users') {
      return null;
    }
    if (log.user?.id === log.recordId) {
      return log.user.fullName || log.user.username || null;
    }
    const u = this.users().find((x) => x.id === log.recordId);
    return u?.fullName || null;
  }

  recordLink(log: AuditLog): (string | number)[] | null {
    const base = RECORD_ROUTES[log.tableName];
    return base && log.recordId != null && log.action !== 'DELETE' ? [base, log.recordId] : null;
  }

  private filterParams() {
    const table = this.tableFilter();
    const excludeNotifications = this.hideNotifications() && table !== AUDIT_NOTIFICATION_TABLE;
    return {
      limit: PAGE_SIZE,
      userId: this.userFilter() ?? undefined,
      tableName: table ?? undefined,
      dateFrom: this.dateFrom() || undefined,
      dateTo: this.dateTo() || undefined,
      hideSessionEvents: this.hideSessionEvents() || undefined,
      hideSystemEvents: this.hideSystemEvents() || undefined,
      excludeTableNames: excludeNotifications ? AUDIT_NOTIFICATION_TABLE : undefined,
    };
  }

  private rememberTables(list: AuditLog[]): void {
    const next = { ...this.tableLabelMap() };
    let changed = false;
    for (const log of list) {
      const label = this.tableLabel(log);
      if (next[log.tableName] !== label) {
        next[log.tableName] = label;
        changed = true;
      }
    }
    if (changed) {
      this.tableLabelMap.set(next);
    }
  }
}
