import { DatePipe } from '@angular/common';
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
import {
  DOCUMENT_CATEGORY_LABELS,
  DocumentCategory,
  DocumentVersion,
  ProjectDocument,
} from '../../core/models/document.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { DocumentService } from '../../core/services/document.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-documents-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './documents-page.component.html',
  styleUrl: './documents-page.component.scss',
})
export class DocumentsPageComponent implements OnInit {
  private readonly api = inject(DocumentService);
  private readonly projectsApi = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly dialog = inject(MatDialog);

  readonly documents = signal<ProjectDocument[]>([]);
  readonly projectFilter = signal<number | 'ALL'>('ALL');
  readonly categoryLabels = DOCUMENT_CATEGORY_LABELS;
  readonly projects = this.projectsApi.projects;
  readonly columns = ['title', 'project', 'category', 'version', 'updatedAt', 'actions'];

  readonly filtered = computed(() => {
    const filter = this.projectFilter();
    const list = this.documents();
    return filter === 'ALL' ? list : list.filter((d) => d.projectId === filter);
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe((list) => this.documents.set(list));
  }

  projectLabel(id: number): string {
    const p = this.projectsApi.getProject(id);
    return p ? `${p.code}` : `#${id}`;
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  categoryLabel(category: ProjectDocument['category']): string {
    return this.categoryLabels[category];
  }

  openCreate(): void {
    const ref = this.dialog.open(DocumentUploadDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
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
      width: '640px',
      maxWidth: '95vw',
      data: doc,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
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

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.form.patchValue({
      fileName: file.name,
      title: this.form.getRawValue().title || file.name.replace(/\.[^.]+$/, ''),
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
      this.error.set('ไม่พบโครงการ');
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
        sizeKb: Math.floor(100 + Math.random() * 500),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('อัปโหลดเอกสารแล้ว (mock)', 'ปิด', { duration: 2500 });
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
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatSnackBarModule,
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
  private readonly ref = inject(MatDialogRef<DocumentVersionsDialogComponent, boolean>);
  readonly doc = inject<ProjectDocument>(MAT_DIALOG_DATA);

  readonly versions = signal<DocumentVersion[]>(this.api.getVersions(this.doc.id));
  readonly columns = ['version', 'fileName', 'size', 'by', 'at', 'note'];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private changed = false;

  readonly form = this.fb.nonNullable.group({
    version: ['', Validators.required],
    fileName: ['', Validators.required],
    note: [''],
  });

  userName(id: number): string {
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.form.patchValue({ fileName: file.name });
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
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.changed = true;
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
