import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiProjectDocument, formatDocumentFileSize } from '../../core/models/document.model';
import { AuthService } from '../../core/services/auth.service';
import { DocumentService } from '../../core/services/document.service';
import { ProjectService } from '../../core/services/project.service';
import {
  EntityPickerComponent,
  PickerOption,
} from '../../shared/components/entity-picker.component';
import { projectSearchFn } from '../../shared/components/entity-search';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { FORM_DIALOG, FORM_DIALOG_COMPACT, FORM_DIALOG_WIDE } from '../../shared/utils/form-dialog';
import { createServerList, invalidateListCache } from '../../shared/utils/server-list';
import {
  ProjectDocumentEditDialogComponent,
  ProjectDocumentUploadDialogComponent,
} from '../projects/project-detail-page.component';
import { DocumentPreviewDialogComponent } from './document-preview-dialog.component';

type DocSortKey = 'title' | 'fileName' | 'fileSize' | 'createdAt';

@Component({
  selector: 'app-documents-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    TablePaginatorComponent,
    EntityPickerComponent,
    RowActionsComponent,
    ListLoadingBarComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './documents-page.component.html',
  styleUrl: './documents-page.component.scss',
})
export class DocumentsPageComponent implements OnInit {
  private readonly api = inject(DocumentService);
  private readonly projects = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly columns = ['title', 'project', 'fileSize', 'uploadedBy', 'createdAt', 'actions'];

  /** projectId = 0 คือทุกโปรเจกต์ */
  readonly list = createServerList<ApiProjectDocument, { projectId: number }>({
    namespace: 'documents',
    filters: { projectId: 0 },
    sortBy: 'createdAt',
    sortOrder: 'DESC',
    sortOrderFor: (key) => (key === 'createdAt' || key === 'fileSize' ? 'DESC' : 'ASC'),
    fetch: ({ filters, ...req }) =>
      this.api.listAll({ ...req, projectId: filters.projectId || undefined }),
  });

  readonly searchControl = this.list.searchControl;
  readonly searchProjects = projectSearchFn(this.projects);

  private readonly pickedProject = signal<PickerOption | null>(null);
  /** ค่าที่เลือกไว้ (เช่นมาจาก URL) แสดงจากข้อมูลโปรเจกต์ในแถวเอง */
  readonly projectFilterOption = computed<PickerOption | null>(() => {
    const id = this.list.filters().projectId;
    if (!id) {
      return null;
    }
    const picked = this.pickedProject();
    if (picked?.id === id) {
      return picked;
    }
    const project = this.list.items().find((row) => row.project?.id === id)?.project;
    return project
      ? { id, label: project.name, code: project.code, meta: project.customerName }
      : { id, label: `โปรเจกต์ #${id}` };
  });

  readonly canView = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.view');
  });
  readonly canCreate = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.create');
  });
  readonly canUpdate = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.update');
  });
  readonly canDelete = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.delete');
  });

  ngOnInit(): void {
    this.list.start();
  }

  onProjectFilterPicked(option: PickerOption | null): void {
    this.pickedProject.set(option);
    this.list.setFilter('projectId', option?.id ?? 0);
  }

  toggleSort(key: DocSortKey): void {
    this.list.toggleSort(key);
  }

  sortIcon(key: DocSortKey): string {
    return this.list.sortIcon(key);
  }

  formatSize(bytes: number): string {
    return formatDocumentFileSize(bytes);
  }

  rowActions(row: ApiProjectDocument): RowAction[] {
    const actions: RowAction[] = [
      { label: 'ดูรายละเอียด', primary: true, icon: 'visibility', run: () => this.openPreview(row) },
      { label: 'ดาวน์โหลด', icon: 'download', run: () => this.download(row) },
    ];
    if (this.canUpdate()) {
      actions.push({ label: 'แก้ไข', icon: 'edit', run: () => this.openEdit(row) });
    }
    if (this.canDelete()) {
      actions.push({ label: 'ลบ', icon: 'delete', danger: true, run: () => this.remove(row) });
    }
    return actions;
  }

  openUpload(): void {
    const projectId = this.list.filters().projectId;
    if (!projectId) {
      this.snack.open('เลือกโปรเจกต์ก่อนอัปโหลดเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    this.dialog
      .open(ProjectDocumentUploadDialogComponent, { ...FORM_DIALOG, data: { projectId } })
      .afterClosed()
      .subscribe((saved) => saved && this.refresh());
  }

  openPreview(row: ApiProjectDocument): void {
    this.dialog.open(DocumentPreviewDialogComponent, { ...FORM_DIALOG_WIDE, data: { document: row } });
  }

  download(row: ApiProjectDocument): void {
    this.api.download(row).subscribe({
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 5000 }),
    });
  }

  openEdit(row: ApiProjectDocument): void {
    this.dialog
      .open(ProjectDocumentEditDialogComponent, { ...FORM_DIALOG_COMPACT, data: { document: row } })
      .afterClosed()
      .subscribe((saved) => saved && this.refresh());
  }

  remove(row: ApiProjectDocument): void {
    openConfirmDialog(this.dialog, {
      title: 'ลบเอกสาร',
      message: `ต้องการลบเอกสาร「${row.title || row.fileName}」หรือไม่?`,
      confirmLabel: 'ลบเอกสาร',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบเอกสารแล้ว', 'ปิด', { duration: 2500 });
          this.refresh();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 5000 }),
      });
    });
  }

  private refresh(): void {
    invalidateListCache('documents');
    this.list.reload({ invalidate: true });
  }
}
