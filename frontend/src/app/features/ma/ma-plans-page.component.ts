import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MaPlan } from '../../core/models/ma.model';
import { AuthService } from '../../core/services/auth.service';
import {
  MaPlanInput,
  MaPlanUpdateInput,
  MaService,
} from '../../core/services/ma.service';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';

type ActiveFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-ma-plans-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './ma-plans-page.component.html',
  styleUrl: './ma-plans-page.component.scss',
})
export class MaPlansPageComponent implements OnInit {
  private readonly api = inject(MaService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly plans = signal<MaPlan[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly activeFilter = signal<ActiveFilter>('all');

  readonly canCreate = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.create');
  });
  readonly canUpdate = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.update');
  });
  readonly canDelete = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.delete');
  });

  readonly columns = [
    'name',
    'bugQuotaPerMonth',
    'responseTimeHour',
    'isActive',
    'sortOrder',
    'actions',
  ];

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const filter = this.activeFilter();
    return this.plans().filter((p) => {
      const matchActive =
        filter === 'all' ||
        (filter === 'active' && p.isActive) ||
        (filter === 'inactive' && !p.isActive);
      if (!matchActive) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q)
      );
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.listPlans({ limit: 100 }).subscribe({
      next: (list) => {
        this.plans.set(list);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.plans.set([]);
        this.snack.open(err.message, 'ปิด', { duration: 3500 });
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate()) {
      return;
    }
    this.openForm();
  }

  openEdit(plan: MaPlan): void {
    if (!this.canUpdate()) {
      return;
    }
    this.openForm(plan);
  }

  remove(plan: MaPlan): void {
    if (!this.canDelete()) {
      return;
    }
    if (!confirm(`ลบแผน "${plan.name}" ?\nถ้าแผนถูกใช้ในสัญญาแล้ว ระบบจะไม่อนุญาต — ให้ปิดใช้งานแทน`)) {
      return;
    }
    this.api.deletePlan(plan.id).subscribe({
      next: () => {
        this.snack.open('ลบแผนแล้ว', 'ปิด', { duration: 2500 });
        this.reload();
      },
      error: (err: Error & { status?: number }) => {
        if (err.status === 409 || this.looksLikeConflict(err.message)) {
          const ref = this.snack.open(
            err.message || 'แผนถูกใช้ในสัญญาแล้ว — ปิดใช้งานแทนการลบ',
            'ปิดใช้งาน',
            { duration: 8000 }
          );
          ref.onAction().subscribe(() => this.deactivate(plan));
          return;
        }
        this.snack.open(err.message, 'ปิด', { duration: 3500 });
      },
    });
  }

  deactivate(plan: MaPlan): void {
    if (!this.canUpdate() && !this.canDelete()) {
      return;
    }
    if (!confirm(`ปิดการใช้งานแผน "${plan.name}" ?\nสัญญาที่ใช้แผนนี้อยู่แล้วไม่ถูกลบ`)) {
      return;
    }
    this.api.updatePlan(plan.id, { isActive: false }).subscribe({
      next: () => {
        this.snack.open('ปิดการใช้งานแผนแล้ว', 'ปิด', { duration: 2500 });
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  activate(plan: MaPlan): void {
    if (!this.canUpdate()) {
      return;
    }
    this.api.updatePlan(plan.id, { isActive: true }).subscribe({
      next: () => {
        this.snack.open('เปิดใช้งานแผนแล้ว', 'ปิด', { duration: 2500 });
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  private looksLikeConflict(message: string): boolean {
    return /สัญญา|อ้าง|ลบไม่ได้|ใช้งานอยู่|409/i.test(message);
  }

  private openForm(plan?: MaPlan): void {
    const ref = this.dialog.open(MaPlanFormDialogComponent, {
      ...FORM_DIALOG,
      data: plan ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}

@Component({
  selector: 'app-ma-plan-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DragDropModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './ma-plans-page.dialog.html',
  styleUrl: './ma-plans-page.component.scss',
})
export class MaPlanFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MaService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<MaPlanFormDialogComponent, boolean>);
  readonly data = inject<MaPlan | null>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data?.id;
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** PATCH: ส่ง items ทั้งชุดเฉพาะเมื่อแก้รายการย่อยจริง */
  readonly itemsDirty = signal(false);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    bugQuotaPerMonth: [0, [Validators.min(0), Validators.max(999)]],
    responseTimeHour: [null as number | null, [Validators.min(1), Validators.max(720)]],
    onsiteQuotaPerMonth: [null as number | null, [Validators.min(0), Validators.max(999)]],
    isActive: [true],
    sortOrder: [0, [Validators.min(0)]],
    items: this.fb.array<FormGroup>([]),
  });

  get items(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  constructor() {
    if (this.isEdit && this.data?.id) {
      this.loading.set(true);
      this.api.getPlanById(this.data.id).subscribe({
        next: (plan) => {
          this.patchFromPlan(plan);
          this.loading.set(false);
          this.itemsDirty.set(false);
        },
        error: (err: Error) => {
          this.loading.set(false);
          this.error.set(err.message);
          this.snack.open(err.message, 'ปิด', { duration: 3500 });
        },
      });
    }
  }

  newItem(title = '', detail: string | null = ''): FormGroup {
    return this.fb.group({
      title: [title, [Validators.required, Validators.maxLength(255)]],
      detail: [detail ?? ''],
    });
  }

  addItem(): void {
    this.items.push(this.newItem());
    this.itemsDirty.set(true);
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
    this.itemsDirty.set(true);
  }

  drop(event: CdkDragDrop<FormGroup[]>): void {
    moveItemInArray(this.items.controls, event.previousIndex, event.currentIndex);
    this.items.updateValueAndValidity();
    this.itemsDirty.set(true);
  }

  onItemFieldChange(): void {
    this.itemsDirty.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const name = (raw.name ?? '').trim();
    if (!name) {
      this.form.controls.name.markAsTouched();
      return;
    }
    const itemsPayload = (raw.items ?? []).map((item) => ({
      title: String(item?.['title'] ?? '').trim(),
      detail: String(item?.['detail'] ?? '').trim() || null,
    }));

    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.data?.id) {
      const payload: MaPlanUpdateInput = {
        name,
        description: raw.description?.trim() || null,
        bugQuotaPerMonth: Number(raw.bugQuotaPerMonth) || 0,
        responseTimeHour: this.toNullableNumber(raw.responseTimeHour),
        onsiteQuotaPerMonth: this.toNullableNumber(raw.onsiteQuotaPerMonth),
        isActive: !!raw.isActive,
        sortOrder: Number(raw.sortOrder) || 0,
      };
      if (this.itemsDirty()) {
        payload.items = itemsPayload;
      }
      this.api.updatePlan(this.data.id, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกแผนแล้ว', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
          this.snack.open(err.message, 'ปิด', { duration: 3500 });
        },
      });
      return;
    }

    const createPayload: MaPlanInput = {
      name,
      description: raw.description?.trim() || null,
      bugQuotaPerMonth: Number(raw.bugQuotaPerMonth) || 0,
      responseTimeHour: this.toNullableNumber(raw.responseTimeHour),
      onsiteQuotaPerMonth: this.toNullableNumber(raw.onsiteQuotaPerMonth),
      isActive: !!raw.isActive,
      sortOrder: Number(raw.sortOrder) || 0,
      items: itemsPayload.length ? itemsPayload : undefined,
    };
    this.api.createPlan(createPayload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('สร้างแผนแล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
        this.snack.open(err.message, 'ปิด', { duration: 3500 });
      },
    });
  }

  private patchFromPlan(plan: MaPlan): void {
    this.form.patchValue({
      name: plan.name,
      description: plan.description ?? '',
      bugQuotaPerMonth: plan.bugQuotaPerMonth,
      responseTimeHour: plan.responseTimeHour,
      onsiteQuotaPerMonth: plan.onsiteQuotaPerMonth,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    });
    this.items.clear();
    const sorted = [...(plan.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const item of sorted) {
      this.items.push(this.newItem(item.title, item.detail));
    }
  }

  private toNullableNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
