import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import {
  DOCUMENT_CATEGORY_LABELS,
  DocumentCategory,
  DocumentVersion,
  ProjectDocument,
} from '../../core/models/document.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  DocumentService,
  buildFilePreview,
} from '../../core/services/document.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { FilePickerComponent } from '../../shared/components/file-picker.component';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { createTableSort } from '../../shared/utils/table-sort';

const MAX_LOCAL_FILE_BYTES = 1_500_000;

/** Chrome/Edge บล็อก navigation ไป data: URL → แปลงเป็น blob: ก่อนเปิด */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    throw new Error('invalid data URL');
  }
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream';
  if (/;base64/i.test(header)) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}

function openDocumentFile(ver: DocumentVersion): void {
  const dataUrl =
    ver.fileDataUrl || buildFilePreview(ver.fileName, ver.version, ver.note ?? '');
  let url = dataUrl;
  try {
    if (dataUrl.startsWith('data:')) {
      url = URL.createObjectURL(dataUrlToBlob(dataUrl));
      // ปล่อยให้แท็บใหม่โหลดเสร็จก่อน revoke
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    }
  } catch {
    url = buildFilePreview(ver.fileName, ver.version, ver.note ?? '');
    url = URL.createObjectURL(dataUrlToBlob(url));
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
  const opened = window.open(url, '_blank');
  if (!opened) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }
}

function readFileAsDataUrl(file: File): Promise<{ dataUrl: string; mimeType: string; sizeKb: number }> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      reject(new Error('ไฟล์ใหญ่เกิน 1.5MB — จะใช้หน้าตัวอย่างแทน'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: String(reader.result ?? ''),
        mimeType: file.type || 'application/octet-stream',
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
      });
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

@Component({
  selector: 'app-documents-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './documents-page.component.html',
  styleUrl: './documents-page.component.scss',
})
export class DocumentsPageComponent implements OnInit {
  private readonly api = inject(DocumentService);
  private readonly projectsApi = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly canDeleteDocument = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.delete');
  });

  readonly documents = signal<ProjectDocument[]>([]);
  readonly projectFilter = signal<number | 'ALL'>('ALL');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  /** ข้อความในช่องกรองโครงการ (พิมพ์ค้นหาได้) */
  readonly projectFilterControl = this.fb.control<string | number | 'ALL'>('ALL');
  readonly projectSearch = signal('');
  readonly categoryLabels = DOCUMENT_CATEGORY_LABELS;
  readonly projects = this.projectsApi.projects;
  readonly columns = ['title', 'project', 'category', 'file', 'version', 'updatedAt', 'actions'];

  readonly filteredProjects = computed(() => {
    const q = this.projectSearch().trim().toLowerCase();
    const list = this.projects();
    if (!q) {
      return list;
    }
    return list.filter(
      (p) =>
        (p.code ?? '').toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q) ||
        String(p.id).includes(q)
    );
  });

  readonly tableSort = createTableSort<
    'title' | 'project' | 'category' | 'file' | 'version' | 'updatedAt'
  >('updatedAt', 'desc');

  readonly filtered = computed(() => {
    const filter = this.projectFilter();
    const q = this.search().trim().toLowerCase();
    let list = this.documents();
    if (filter !== 'ALL') {
      list = list.filter((d) => d.projectId === filter);
    }
    if (q) {
      list = list.filter((d) => {
        const project = this.projectsApi.getProject(d.projectId);
        const projectText = project ? project.name.toLowerCase() : '';
        const versions = this.api.getVersions(d.id);
        const fileMatch = versions.some(
          (v) =>
            v.fileName.toLowerCase().includes(q) ||
            v.version.toLowerCase().includes(q) ||
            (v.note ?? '').toLowerCase().includes(q)
        );
        return (
          d.title.toLowerCase().includes(q) ||
          this.customerName(d.customerId).toLowerCase().includes(q) ||
          projectText.includes(q) ||
          this.categoryLabels[d.category].toLowerCase().includes(q) ||
          d.currentVersion.toLowerCase().includes(q) ||
          fileMatch
        );
      });
    }
    return this.tableSort.apply(list, (row, key) => {
      switch (key) {
        case 'title':
          return row.title;
        case 'project':
          return this.projectLabel(row.projectId);
        case 'category':
          return this.categoryLabel(row.category);
        case 'file':
          return this.currentFileName(row);
        case 'version':
          return row.currentVersion;
        case 'updatedAt':
          return new Date(row.updatedAt).getTime();
      }
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.projectFilterControl.valueChanges.subscribe((v) => {
      if (typeof v === 'number' || v === 'ALL') {
        this.projectSearch.set('');
        return;
      }
      const text = String(v ?? '').trim();
      if (!text || text === 'ทั้งหมด') {
        this.projectSearch.set('');
        return;
      }
      this.projectSearch.set(text);
    });
    this.customersApi.listCustomers().subscribe({ error: () => undefined });
    this.projectsApi.listProjects().subscribe({
      next: (projects) => {
        const first = projects[0];
        if (!first) {
          this.reload();
          return;
        }
        const userId = this.auth.currentUser()?.id ?? 1;
        this.api
          .ensureDemoSeed(first.customerId, first.id, userId)
          .subscribe((list) => this.documents.set(list));
      },
      error: () => this.reload(),
    });
  }

  readonly displayProjectFilter = (value: unknown): string => {
    if (value === 'ALL' || value == null || value === '') {
      return value === 'ALL' ? 'ทั้งหมด' : '';
    }
    if (typeof value === 'number') {
      const p = this.projectsApi.getProject(value);
      return p ? p.name : `#${value}`;
    }
    return String(value);
  };

  onProjectFilterFocus(): void {
    this.projectFilterControl.setValue('');
    this.projectSearch.set('');
  }

  /** Material ใส่ class ผ่าน [class] — บังคับซ้ำตอนเปิดแผงเพื่อซ่อนสกอลล์บาร์ */
  onProjectFilterPanelOpened(): void {
    requestAnimationFrame(() => {
      document
        .querySelectorAll('.cdk-overlay-container .mat-mdc-autocomplete-panel')
        .forEach((node) => {
          const el = node as HTMLElement;
          el.classList.add('project-filter-auto-panel');
          el.style.setProperty('scrollbar-width', 'none');
          el.style.setProperty('-ms-overflow-style', 'none');
        });
    });
  }

  onProjectFilterBlur(): void {
    queueMicrotask(() => {
      this.projectFilterControl.setValue(this.projectFilter() as never, { emitEvent: false });
      this.projectSearch.set('');
    });
  }

  onProjectFilterSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as number | 'ALL';
    this.projectFilter.set(value);
    this.projectSearch.set('');
  }

  projectFilterLabel(): string {
    return this.displayProjectFilter(this.projectFilter()) || 'ทั้งหมด';
  }

  reload(): void {
    this.api.list().subscribe((list) => this.documents.set(list));
  }

  projectLabel(id: number): string {
    const p = this.projectsApi.getProject(id);
    return p ? p.name : `#${id}`;
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  categoryLabel(category: ProjectDocument['category']): string {
    return this.categoryLabels[category];
  }

  toggleSort(
    key: 'title' | 'project' | 'category' | 'file' | 'version' | 'updatedAt'
  ): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(
    key: 'title' | 'project' | 'category' | 'file' | 'version' | 'updatedAt'
  ): string {
    return this.tableSort.sortIcon(key);
  }

  currentFileName(doc: ProjectDocument): string {
    return this.api.getLatestVersion(doc.id)?.fileName ?? '—';
  }

  viewCurrentFile(doc: ProjectDocument): void {
    const ver = this.api.getLatestVersion(doc.id);
    if (!ver) {
      return;
    }
    openDocumentFile(ver);
  }

  openCreate(): void {
    const ref = this.dialog.open(DocumentUploadDialogComponent, {
      ...FORM_DIALOG,
      data: { mode: 'create' as const },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  openVersions(doc: ProjectDocument): void {
    const ref = this.dialog.open(DocumentVersionsDialogComponent, {
      ...FORM_DIALOG,
      data: doc,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  removeDocument(doc: ProjectDocument): void {
    if (!this.canDeleteDocument()) {
      this.snack.open('คุณไม่มีสิทธิ์ลบเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบเอกสาร',
      message: `ลบเอกสาร「${doc.title}」และทุกเวอร์ชันหรือไม่?`,
      confirmLabel: 'ลบเอกสาร',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.deleteDocument(doc.id).subscribe({
        next: () => {
          this.snack.open('ลบเอกสารแล้ว', 'ปิด', { duration: 2200 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }
}

@Component({
  selector: 'app-document-upload-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    FilePickerComponent,
  ],
  templateUrl: './document-upload-dialog.component.html',
  styleUrl: './document-upload-dialog.component.scss',
})
export class DocumentUploadDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentService);
  private readonly projectsApi = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<DocumentUploadDialogComponent, boolean>);

  readonly projects = this.projectsApi.projects;
  readonly categoryLabels = DOCUMENT_CATEGORY_LABELS;
  readonly categories = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private pendingFile: { dataUrl: string; mimeType: string; sizeKb: number } | null = null;

  readonly form = this.fb.group({
    projectId: [0, Validators.min(1)],
    title: ['', Validators.required],
    category: ['SPEC' as DocumentCategory],
    version: ['v1.0', Validators.required],
    fileName: ['', Validators.required],
    note: [''],
  });

  constructor() {
    const first = this.projects()[0];
    if (first) {
      this.form.patchValue({ projectId: first.id });
    }
  }

  onFilePicked(file: File | null): void {
    if (!file) {
      this.form.patchValue({ fileName: '' });
      this.pendingFile = null;
      return;
    }
    this.form.patchValue({
      fileName: file.name,
      title: this.form.getRawValue().title || file.name.replace(/\.[^.]+$/, ''),
    });
    this.pendingFile = null;
    readFileAsDataUrl(file)
      .then((data) => {
        this.pendingFile = data;
        this.error.set(null);
      })
      .catch((err: Error) => {
        this.pendingFile = null;
        this.error.set(err.message);
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const project = this.projectsApi.getProject(Number(raw.projectId));
    if (!project) {
      this.error.set('ไม่พบโปรเจกต์');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .create({
        projectId: project.id,
        customerId: project.customerId,
        title: raw.title ?? '',
        category: (raw.category as DocumentCategory) ?? 'OTHER',
        fileName: raw.fileName ?? '',
        version: raw.version ?? 'v1.0',
        note: raw.note ?? '',
        uploadedByUserId: this.auth.currentUser()?.id ?? 1,
        sizeKb: this.pendingFile?.sizeKb ?? Math.floor(100 + Math.random() * 500),
        fileDataUrl: this.pendingFile?.dataUrl ?? null,
        mimeType: this.pendingFile?.mimeType ?? null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open(
            this.pendingFile ? 'อัปโหลดเอกสารแล้ว (เปิดดูไฟล์ได้)' : 'อัปโหลดเอกสารแล้ว (หน้าตัวอย่าง)',
            'ปิด',
            { duration: 2500 }
          );
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}

@Component({
  selector: 'app-document-versions-dialog',
  standalone: true,
  imports: [
    ThaiDatePipe,
        ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatTooltipModule,
    FilePickerComponent,
  ],
  templateUrl: './document-versions-dialog.component.html',
  styleUrl: './document-versions-dialog.component.scss',
})
export class DocumentVersionsDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<DocumentVersionsDialogComponent, boolean>);
  readonly doc = inject<ProjectDocument>(MAT_DIALOG_DATA);

  readonly versions = signal<DocumentVersion[]>(this.api.getVersions(this.doc.id));
  readonly columns = ['version', 'fileName', 'size', 'by', 'at', 'note', 'actions'];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private changed = false;
  private pendingFile: { dataUrl: string; mimeType: string; sizeKb: number } | null = null;

  readonly form = this.fb.nonNullable.group({
    version: ['', Validators.required],
    fileName: ['', Validators.required],
    note: [''],
  });

  userName(id: number): string {
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  viewFile(ver: DocumentVersion): void {
    openDocumentFile(ver);
  }

  removeVersion(ver: DocumentVersion): void {
    if (this.versions().length <= 1) {
      this.snack.open('ต้องเหลืออย่างน้อย 1 เวอร์ชัน', 'ปิด', { duration: 2500 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบเวอร์ชัน',
      message: `ลบเวอร์ชัน ${ver.version} (${ver.fileName}) หรือไม่?`,
      confirmLabel: 'ลบเวอร์ชัน',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.deleteVersion(this.doc.id, ver.id).subscribe({
        next: (list) => {
          this.changed = true;
          this.versions.set(list);
          this.snack.open('ลบเวอร์ชันแล้ว', 'ปิด', { duration: 2200 });
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }

  onFilePicked(file: File | null): void {
    if (!file) {
      this.form.patchValue({ fileName: '' });
      this.pendingFile = null;
      return;
    }
    this.form.patchValue({ fileName: file.name });
    this.pendingFile = null;
    readFileAsDataUrl(file)
      .then((data) => {
        this.pendingFile = data;
        this.error.set(null);
      })
      .catch((err: Error) => {
        this.pendingFile = null;
        this.error.set(err.message);
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .addVersion(this.doc.id, {
        version: raw.version,
        fileName: raw.fileName,
        note: raw.note,
        uploadedByUserId: this.auth.currentUser()?.id ?? 1,
        sizeKb: this.pendingFile?.sizeKb,
        fileDataUrl: this.pendingFile?.dataUrl ?? null,
        mimeType: this.pendingFile?.mimeType ?? null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.changed = true;
          this.pendingFile = null;
          this.versions.set(this.api.getVersions(this.doc.id));
          this.form.reset({ version: '', fileName: '', note: '' });
          this.snack.open('เพิ่มเวอร์ชันแล้ว', 'ปิด', { duration: 2500 });
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  close(): void {
    this.ref.close(this.changed);
  }
}