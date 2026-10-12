import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  PROJECT_STATUS_LABELS,
  Project,
  ProjectStatus,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import {
  EntityPickerComponent,
  PickerOption,
} from '../../shared/components/entity-picker.component';
import { projectPickerOption, projectSearchFn } from '../../shared/components/entity-search';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { TaskEditDialogComponent } from './task-edit-dialog.component';
import { TaskReviewDialogComponent } from './task-review-dialog.component';
import { TaskSubmitReportDialogComponent } from './task-submit-report-dialog.component';

/** สถานะที่ลากเปลี่ยนคอลัมน์ได้ด้วย PATCH /status */
const FREE_MOVE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'TODO',
  'DOING',
  'WAITING',
]);

const DONE_PAGE_SIZE = 20;
const OTHER_LIMIT = 100;

@Component({
  selector: 'app-task-kanban-board',
  standalone: true,
  imports: [
    RouterLink,
    DragDropModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    ThaiDatePipe,
    EntityPickerComponent,
  ],
  templateUrl: './task-kanban-board.component.html',
  styleUrl: './task-kanban-board.component.scss',
})
export class TaskKanbanBoardComponent implements OnInit, OnChanges {
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** null = งานทั้งบริษัท */
  @Input() projectId: number | null = null;
  /** true เมื่อเป็นบอร์ดทั้งบริษัท — แสดงตัวกรองโปรเจกต์ */
  @Input() showProjectFilter = false;
  /** ตั้งค่าเริ่มต้นตัวกรองผู้รับผิดชอบ (เช่น จาก ?mine=1) */
  @Input() initialAssigneeId: number | null = null;
  /** ตั้งค่าเริ่มต้นตัวกรองโปรเจกต์บนบอร์ดทั้งบริษัท (เช่น จาก ?projectId=) */
  @Input() initialProjectId: number | null = null;
  /** หน้าแม่มีปุ่มรีเฟรชที่หัวหน้าแล้ว — มือถือไม่ต้องโชว์ปุ่มรีเฟรชในแถบตัวกรองซ้ำ */
  @Input() refreshInHeader = false;

  readonly statuses = TASK_STATUSES;
  /** ซ่อนคอลัมน์「เสร็จ」เป็นค่าเริ่มต้น — หัวหน้าดูเฉพาะงานที่ยังค้าง */
  readonly showDone = signal(false);
  readonly visibleStatuses = computed(() =>
    this.showDone() ? this.statuses : this.statuses.filter((s) => s !== 'DONE')
  );
  readonly statusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly users = this.usersApi.assignableTask;

  readonly summary = signal<TaskSummary | null>(null);
  readonly searchProjects = projectSearchFn(this.projectsApi);
  readonly projectFilterOption = signal<PickerOption | null>(null);
  readonly columnTasks = signal<Record<TaskStatus, TaskItem[]>>({
    TODO: [],
    DOING: [],
    WAITING: [],
    REVIEW: [],
    DONE: [],
  });
  readonly columnLoading = signal<Partial<Record<TaskStatus, boolean>>>({});
  readonly donePage = signal(1);
  readonly doneHasMore = signal(false);
  readonly savingId = signal<number | null>(null);

  readonly projectFilter = signal<number | 'ALL'>('ALL');
  readonly assigneeFilter = signal<number | 'ALL' | 'UNASSIGNED'>('ALL');
  readonly priorityFilter = signal<TaskPriority | 'ALL'>('ALL');
  /** มือถือ — ช่องผู้รับผิดชอบ/ความสำคัญพับไว้หลังปุ่ม「ตัวกรอง」 */
  readonly filtersOpen = signal(false);
  readonly activeFilterCount = computed(
    () => (this.assigneeFilter() !== 'ALL' ? 1 : 0) + (this.priorityFilter() !== 'ALL' ? 1 : 0)
  );

  /** กันคลิกเปิดรายละเอียดหลังลาก */
  private dragActive = false;

  readonly canDrag = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.update');
  });

  readonly canCreateTask = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.create');
  });

  readonly canReviewTasks = computed(() => {
    this.auth.session();
    return this.auth.canAccessTaskReviewQueue();
  });

  readonly activeProjectId = computed(() => this.effectiveProjectId());

  ngOnInit(): void {
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe({
      error: () => undefined,
    });
    if (this.initialAssigneeId != null && this.initialAssigneeId > 0) {
      this.assigneeFilter.set(this.initialAssigneeId);
    }
    if (this.showProjectFilter && this.initialProjectId != null && this.initialProjectId > 0) {
      const id = this.initialProjectId;
      this.projectFilter.set(id);
      this.projectFilterOption.set({ id, label: `โปรเจกต์ #${id}` });
      this.projectsApi.fetchProject(id).subscribe({
        next: (p) => this.projectFilterOption.set(projectPickerOption(p)),
        error: () => undefined,
      });
    }
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange) {
      this.reload();
    }
    if (changes['initialAssigneeId'] && !changes['initialAssigneeId'].firstChange) {
      const id = this.initialAssigneeId;
      this.assigneeFilter.set(id != null && id > 0 ? id : 'ALL');
      this.applyFilters();
    }
  }

  reload(): void {
    this.applyFilters();
  }

  onProjectFilterPicked(option: PickerOption | null): void {
    this.projectFilterOption.set(option);
    this.projectFilter.set(option?.id ?? 'ALL');
    this.applyFilters();
  }

  applyFilters(): void {
    this.donePage.set(1);
    this.loadSummary();
    for (const status of this.visibleStatuses()) {
      this.loadColumn(status, 1, false);
    }
  }

  scrollToColumn(status: string): void {
    document
      .getElementById(`kanban-col-${status}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  toggleDone(): void {
    const next = !this.showDone();
    this.showDone.set(next);
    if (next) {
      this.loadColumn('DONE', 1, false);
    } else {
      this.patchColumn('DONE', []);
      this.donePage.set(1);
      this.doneHasMore.set(false);
    }
  }

  loadMoreDone(): void {
    if (!this.doneHasMore() || this.columnLoading()['DONE']) {
      return;
    }
    const next = this.donePage() + 1;
    this.loadColumn('DONE', next, true);
  }

  columnCount(status: TaskStatus): number {
    return this.summary()?.byStatus?.[status] ?? this.columnTasks()[status].length;
  }

  columnOverdue(status: TaskStatus): number {
    if (status === 'DONE') {
      return 0;
    }
    return this.summary()?.overdueByStatus?.[status] ?? 0;
  }

  onDragStarted(): void {
    this.dragActive = true;
  }

  onDragEnded(): void {
    // หน่วงสั้น ๆ ให้ click หลัง drop ไม่เปิด dialog
    setTimeout(() => {
      this.dragActive = false;
    }, 40);
  }

  onDrop(event: CdkDragDrop<TaskItem[]>, targetStatus: TaskStatus): void {
    if (!this.canDrag()) {
      return;
    }

    if (event.previousContainer === event.container) {
      this.reorderInColumn(event, targetStatus);
      return;
    }

    const previousStatus = this.statusFromDropId(event.previousContainer.id);
    if (!previousStatus || previousStatus === targetStatus) {
      return;
    }

    const task = event.previousContainer.data[event.previousIndex];
    if (!task) {
      return;
    }

    const block = this.dragBlockReason(previousStatus, targetStatus);
    if (block) {
      this.snack.open(block, 'ปิด', { duration: 4000 });
      return;
    }

    const prevList = [...event.previousContainer.data];
    const nextList = [...event.container.data];
    transferArrayItem(prevList, nextList, event.previousIndex, event.currentIndex);

    const optimistic: TaskItem = { ...task, status: targetStatus };
    nextList[event.currentIndex] = optimistic;
    this.patchColumn(previousStatus, prevList);
    this.patchColumn(targetStatus, nextList);
    this.bumpSummary(previousStatus, targetStatus);
    this.savingId.set(task.id);

    this.projectsApi.updateTaskStatus(task.id, targetStatus).subscribe({
      next: (updated) => {
        this.replaceInColumn(targetStatus, updated);
        this.projectsApi.updateTaskOrder(updated.id, event.currentIndex).subscribe({
          next: (ordered) => {
            this.replaceInColumn(targetStatus, ordered);
            this.savingId.set(null);
            this.loadSummary();
          },
          error: () => {
            this.savingId.set(null);
            this.loadSummary();
          },
        });
      },
      error: (err: Error) => {
        this.savingId.set(null);
        const revertPrev = this.columnTasks()[previousStatus].filter((t) => t.id !== task.id);
        const revertNext = this.columnTasks()[targetStatus].filter((t) => t.id !== task.id);
        revertPrev.splice(event.previousIndex, 0, task);
        this.patchColumn(previousStatus, revertPrev);
        this.patchColumn(targetStatus, revertNext);
        this.bumpSummary(targetStatus, previousStatus);
        this.snack.open(err.message || 'อัปเดตสถานะไม่สำเร็จ', 'ปิด', { duration: 3500 });
        this.loadSummary();
      },
    });
  }

  onCardClick(task: TaskItem): void {
    if (this.dragActive || this.savingId() === task.id) {
      return;
    }
    this.openTask(task);
  }

  canSubmit(task: TaskItem): boolean {
    if (!this.canDrag() || task.status !== 'DOING') {
      return false;
    }
    return this.isOwnAssignment(task);
  }

  canReview(task: TaskItem): boolean {
    if (!this.canReviewTasks() || task.status !== 'REVIEW') {
      return false;
    }
    return !this.auth.blocksSelfReview(task);
  }

  openSubmit(task: TaskItem, event?: Event): void {
    event?.stopPropagation();
    if (task.status !== 'DOING') {
      this.snack.open('ส่งตรวจได้เมื่อกำลังทำแล้วเท่านั้น', 'ปิด', { duration: 3500 });
      return;
    }
    const ref = this.dialog.open(TaskSubmitReportDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { task },
    });
    ref.afterClosed().subscribe((ok) => {
      if (ok) {
        this.reload();
      }
    });
  }

  openReview(task: TaskItem, event?: Event): void {
    event?.stopPropagation();
    if (!this.canReviewTasks()) {
      this.snack.open('ไม่มีสิทธิ์ตรวจงาน', 'ปิด', { duration: 3000 });
      return;
    }
    if (this.auth.blocksSelfReview(task)) {
      this.snack.open('ผู้รับผิดชอบห้ามตรวจงานตัวเอง', 'ปิด', { duration: 3500 });
      return;
    }
    const ref = this.dialog.open(TaskReviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { taskId: task.id, seed: task },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) {
        this.reload();
      }
    });
  }

  openTask(task: TaskItem): void {
    if (this.canReview(task)) {
      this.openReview(task);
      return;
    }
    const workflow: 'assignee' | 'reviewer' = 'assignee';
    const ref = this.dialog.open(TaskEditDialogComponent, {
      ...FORM_DIALOG,
      data: {
        projectId: task.projectId,
        task,
        readOnly: !this.canDrag(),
        workflow,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  assigneeName(task: TaskItem): string {
    if (task.assignedUser?.fullName) {
      return task.assignedUser.fullName;
    }
    if (!task.assignedUserId) {
      return 'ยังไม่มอบหมาย';
    }
    return this.usersApi.getById(task.assignedUserId)?.fullName ?? `#${task.assignedUserId}`;
  }

  projectLabel(task: TaskItem): string {
    if (task.project) {
      return task.project.name;
    }
    return `#${task.projectId}`;
  }

  isClosedProject(task: TaskItem): boolean {
    const st = task.project?.status;
    return st === 'CLOSED' || st === 'CANCELLED';
  }

  projectStatusLabel(status: ProjectStatus | string): string {
    return this.projectStatusLabels[status as ProjectStatus] ?? status;
  }

  priorityLabel(priority: TaskPriority): string {
    return this.priorityLabels[priority];
  }

  trackTask(_: number, task: TaskItem): number {
    return task.id;
  }

  openCreateTask(): void {
    const projectId = this.activeProjectId();
    if (!projectId) {
      this.snack.open('เลือกโปรเจกต์ก่อนจึงเพิ่มงานได้', 'ปิด', { duration: 3000 });
      return;
    }
    if (!this.canCreateTask()) {
      this.snack.open('ไม่มีสิทธิ์เพิ่มงาน', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(TaskEditDialogComponent, {
      ...FORM_DIALOG,
      data: { projectId, task: null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  private reorderInColumn(
    event: CdkDragDrop<TaskItem[]>,
    status: TaskStatus
  ): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const list = [...event.container.data];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.patchColumn(status, list);

    const moved = list[event.currentIndex];
    if (!moved) {
      return;
    }
    this.savingId.set(moved.id);
    this.projectsApi.updateTaskOrder(moved.id, event.currentIndex).subscribe({
      next: (updated) => {
        this.replaceInColumn(status, updated);
        // หลัง BE เรียงพี่น้องใหม่ — โหลดคอลัมน์นี้ให้ตรงลำดับจริง
        this.loadColumn(status, status === 'DONE' ? this.donePage() : 1, false);
        this.savingId.set(null);
      },
      error: (err: Error) => {
        this.savingId.set(null);
        this.snack.open(err.message || 'เรียงลำดับไม่สำเร็จ', 'ปิด', { duration: 3500 });
        this.loadColumn(status, status === 'DONE' ? this.donePage() : 1, false);
      },
    });
  }

  /** เหตุผลห้ามลาก — null = อนุญาต */
  private dragBlockReason(from: TaskStatus, to: TaskStatus): string | null {
    if (FREE_MOVE_STATUSES.has(from) && FREE_MOVE_STATUSES.has(to)) {
      return null;
    }
    if (to === 'REVIEW') {
      return 'เข้าคอลัมน์「ส่งตรวจ」ต้องกดปุ่มส่งตรวจ — ห้ามลากเข้าตรง ๆ';
    }
    if (to === 'DONE') {
      return 'เข้าคอลัมน์「เสร็จ」ต้องตรวจผ่านจากผู้ตรวจ — ห้ามลากเข้าตรง ๆ';
    }
    if (from === 'REVIEW') {
      return 'งานใน「ส่งตรวจ」ต้องกดตรวจผ่านหรือส่งกลับ — ห้ามลากเปลี่ยนสถานะ';
    }
    if (from === 'DONE') {
      return 'งานที่เสร็จแล้วห้ามลากเปลี่ยนสถานะ';
    }
    return 'ย้ายสถานะนี้ด้วยการลากไม่ได้';
  }

  private isOwnAssignment(task: TaskItem): boolean {
    const me = this.auth.currentUser()?.id;
    return me != null && task.assignedUserId === me;
  }

  private loadSummary(): void {
    const pid = this.effectiveProjectId();
    this.projectsApi
      .getTaskSummary(pid ?? undefined)
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  private loadColumn(status: TaskStatus, page: number, append: boolean): void {
    this.columnLoading.update((m) => ({ ...m, [status]: true }));
    const assignee = this.assigneeFilter();
    const priority = this.priorityFilter();
    const limit = status === 'DONE' ? DONE_PAGE_SIZE : OTHER_LIMIT;

    this.projectsApi
      .listAllTasks({
        status,
        projectId: this.effectiveProjectId() ?? undefined,
        assignedUserId: typeof assignee === 'number' ? assignee : undefined,
        priority: priority === 'ALL' ? undefined : priority,
        limit,
        page: status === 'DONE' ? page : 1,
      })
      .pipe(catchError(() => of([] as TaskItem[])))
      .subscribe((rows) => {
        let list = rows;
        if (assignee === 'UNASSIGNED') {
          list = list.filter((t) => t.assignedUserId == null);
        }
        list = this.sortTasks(list);

        if (status === 'DONE') {
          this.donePage.set(page);
          this.doneHasMore.set(rows.length >= DONE_PAGE_SIZE);
          if (append) {
            const existing = this.columnTasks()['DONE'];
            const ids = new Set(existing.map((t) => t.id));
            const merged = [...existing, ...list.filter((t) => !ids.has(t.id))];
            this.patchColumn('DONE', this.sortTasks(merged));
          } else {
            this.patchColumn('DONE', list);
          }
        } else {
          this.patchColumn(status, list);
        }
        this.columnLoading.update((m) => ({ ...m, [status]: false }));
      });
  }

  private effectiveProjectId(): number | null {
    if (this.projectId != null) {
      return this.projectId;
    }
    if (this.showProjectFilter) {
      const f = this.projectFilter();
      return typeof f === 'number' ? f : null;
    }
    return null;
  }

  private patchColumn(status: TaskStatus, tasks: TaskItem[]): void {
    this.columnTasks.update((all) => ({ ...all, [status]: tasks }));
  }

  private replaceInColumn(status: TaskStatus, task: TaskItem): void {
    const list = this.columnTasks()[status].map((t) => (t.id === task.id ? task : t));
    this.patchColumn(status, list);
  }

  private bumpSummary(from: TaskStatus, to: TaskStatus): void {
    this.summary.update((s) => {
      if (!s) {
        return s;
      }
      const byStatus = { ...s.byStatus };
      byStatus[from] = Math.max(0, (byStatus[from] ?? 1) - 1);
      byStatus[to] = (byStatus[to] ?? 0) + 1;
      return { ...s, byStatus };
    });
  }

  /** เรียงตาม sortOrder จาก BE — คงลำดับหลัง PATCH order */
  private sortTasks(tasks: TaskItem[]): TaskItem[] {
    return [...tasks].sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) {
        return ao - bo;
      }
      return a.id - b.id;
    });
  }

  private statusFromDropId(id: string): TaskStatus | null {
    const raw = id.replace(/^kanban-/, '') as TaskStatus;
    return this.statuses.includes(raw) ? raw : null;
  }
}
