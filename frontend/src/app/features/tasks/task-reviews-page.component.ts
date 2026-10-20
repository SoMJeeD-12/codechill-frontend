import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageEvent } from '@angular/material/paginator';
import { Subscription, debounceTime, distinctUntilChanged, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  TaskReviewItem,
  TaskReviewResult,
  TaskReviewSortBy,
  TaskReviewTab,
} from '../../core/models/project.model';
import { NavAttentionService } from '../../core/services/nav-attention.service';
import { ProjectService } from '../../core/services/project.service';
import {
  EntityPickerComponent,
  PickerOption,
} from '../../shared/components/entity-picker.component';
import { projectPickerOption, projectSearchFn } from '../../shared/components/entity-search';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { downloadAuthorizedBlobAs } from '../../shared/utils/download-blob';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';
import { FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { TaskReviewDialogComponent } from '../projects/task-review-dialog.component';

type ResultFilter = 'ALL' | TaskReviewResult;

type ReviewRow = TaskReviewItem & { assigneeName: string };

const RESULT_LABELS: Record<string, string> = {
  APPROVED: 'ผ่าน',
  REJECTED: 'ตีกลับ',
  PENDING: 'รอตรวจ',
};

/** GET /tasks/reviews — แท็บรอตรวจ / ประวัติที่ฉันตรวจ (แบ่งหน้าฝั่ง server) */
@Component({
  selector: 'app-task-reviews-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    TablePaginatorComponent,
    ThaiDatePipe,
    EntityPickerComponent,
  ],
  templateUrl: './task-reviews-page.component.html',
  styleUrl: './task-reviews-page.component.scss',
})
export class TaskReviewsPageComponent implements OnInit {
  private readonly projectsApi = inject(ProjectService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly attention = inject(NavAttentionService);

  readonly tab = signal<TaskReviewTab>('PENDING');
  readonly resultFilter = signal<ResultFilter>('ALL');
  readonly projectId = signal<number | null>(null);
  readonly searchControl = this.fb.nonNullable.control('');

  readonly rows = signal<ReviewRow[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];
  readonly loading = signal(true);
  readonly downloadingId = signal<number | null>(null);

  readonly searchProjects = projectSearchFn(this.projectsApi);
  readonly projectOption = signal<PickerOption | null>(null);
  readonly sortBy = signal<TaskReviewSortBy | null>(null);
  readonly sortOrder = signal<'ASC' | 'DESC'>('ASC');
  readonly columns = computed(() =>
    this.tab() === 'PENDING'
      ? ['project', 'title', 'assignee', 'submittedBy', 'submittedAt', 'actions']
      : ['project', 'title', 'assignee', 'submittedBy', 'submittedAt', 'result', 'reviewedAt', 'reviewNote']
  );

  private loadSub: Subscription | null = null;

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.tab.set(q.get('tab') === 'REVIEWED' ? 'REVIEWED' : 'PENDING');
    const result = q.get('result');
    this.resultFilter.set(result === 'APPROVED' || result === 'REJECTED' ? result : 'ALL');
    const pid = Number(q.get('projectId'));
    this.projectId.set(Number.isFinite(pid) && pid > 0 ? pid : null);
    if (this.projectId() != null) {
      const id = pid;
      this.projectOption.set({ id, label: `โปรเจกต์ #${id}` });
      this.projectsApi.fetchProject(id).subscribe({
        next: (p) => this.projectOption.set(projectPickerOption(p)),
        error: () => undefined,
      });
    }

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pageIndex.set(0);
        this.load();
      });

    this.load();
  }

  setTab(tab: TaskReviewTab): void {
    if (this.tab() === tab) {
      return;
    }
    this.tab.set(tab);
    if (tab === 'PENDING' && this.sortBy() === 'reviewedAt') {
      this.sortBy.set(null);
    }
    this.pageIndex.set(0);
    this.syncQuery();
    this.load();
  }

  setResult(value: ResultFilter): void {
    this.resultFilter.set(value);
    this.pageIndex.set(0);
    this.syncQuery();
    this.load();
  }

  onProjectPicked(option: PickerOption | null): void {
    this.projectOption.set(option);
    this.setProject(option?.id ?? null);
  }

  setProject(value: number | null): void {
    this.projectId.set(value);
    this.pageIndex.set(0);
    this.syncQuery();
    this.load();
  }

  toggleSort(key: TaskReviewSortBy): void {
    if (this.sortBy() === key) {
      this.sortOrder.update((dir) => (dir === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      this.sortBy.set(key);
      this.sortOrder.set(key === 'submittedAt' || key === 'reviewedAt' ? 'DESC' : 'ASC');
    }
    this.pageIndex.set(0);
    this.load();
  }

  sortIcon(key: TaskReviewSortBy): string {
    if (this.sortBy() !== key) {
      return 'unfold_more';
    }
    return this.sortOrder() === 'ASC' ? 'arrow_upward' : 'arrow_downward';
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    const tab = this.tab();
    const result = this.resultFilter();
    this.loadSub = this.projectsApi
      .listTaskReviews({
        tab,
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
        projectId: this.projectId(),
        search: this.searchControl.value,
        result: tab === 'REVIEWED' && result !== 'ALL' ? result : null,
        sortBy: this.sortBy(),
        sortOrder: this.sortOrder(),
      })
      .pipe(
        switchMap(({ items, total }) => {
          if (!items.length) {
            return of({ items: [] as ReviewRow[], total });
          }
          return forkJoin(
            items.map((row) =>
              this.projectsApi.getTask(row.task.id).pipe(
                map((task) => ({
                  ...row,
                  assigneeName: task.assignedUser?.fullName?.trim() || '—',
                })),
                catchError(() => of({ ...row, assigneeName: '—' })),
              ),
            ),
          ).pipe(map((enriched) => ({ items: enriched, total })));
        }),
      )
      .subscribe({
        next: ({ items, total }) => {
          this.rows.set(items);
          this.total.set(total);
          this.loading.set(false);
          const unfiltered = tab === 'PENDING' && !this.projectId() && !this.searchControl.value.trim();
          if (unfiltered && total !== this.attention.badge('tasks-review')) {
            this.attention.refreshBadges();
          }
        },
        error: (err: Error) => {
          this.rows.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.snack.open(err.message || 'โหลดงานตรวจไม่สำเร็จ', 'ปิด', { duration: 4000 });
        },
      });
  }

  openRow(row: TaskReviewItem): void {
    if (this.tab() !== 'PENDING') {
      return;
    }
    const ref = this.dialog.open(TaskReviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { taskId: row.task.id },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) {
        this.load();
      }
    });
  }

  downloadReviewFile(row: TaskReviewItem, event: Event): void {
    event.stopPropagation();
    const sub = row.submission;
    if (!sub.reviewDownloadUrl || !sub.id) {
      return;
    }
    this.downloadingId.set(sub.id);
    downloadAuthorizedBlobAs(this.http, sub.reviewDownloadUrl, sub.reviewFileName || '').subscribe({
      next: () => this.downloadingId.set(null),
      error: (err: Error) => {
        this.downloadingId.set(null);
        this.snack.open(err.message || 'ดาวน์โหลดไฟล์ไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  resultLabel(status: string | null): string {
    return RESULT_LABELS[status ?? ''] ?? status ?? '—';
  }

  private syncQuery(): void {
    const queryParams: Record<string, string | number | null> = {
      tab: this.tab() === 'REVIEWED' ? 'REVIEWED' : null,
      result: this.tab() === 'REVIEWED' && this.resultFilter() !== 'ALL' ? this.resultFilter() : null,
      projectId: this.projectId(),
    };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }
}
