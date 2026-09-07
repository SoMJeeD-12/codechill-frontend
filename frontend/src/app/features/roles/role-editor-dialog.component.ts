import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  PERMISSION_ACTIONS,
  ROLE_EDITABLE_MENUS,
} from '../../core/models/customer.model';
import { Permission, PermissionAction, Role } from '../../core/models/permission.model';
import { RoleService } from '../../core/services/role.service';

@Component({
  selector: 'app-role-editor-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSnackBarModule,
  ],
  templateUrl: './role-editor-dialog.component.html',
  styleUrl: './role-editor-dialog.component.scss',
})
export class RoleEditorDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly rolesApi = inject(RoleService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<RoleEditorDialogComponent, boolean>);
  readonly data = inject<{ role: Role | null }>(MAT_DIALOG_DATA);

  readonly menus = ROLE_EDITABLE_MENUS;
  readonly actions = PERMISSION_ACTIONS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private matrix = new Map<string, Set<PermissionAction>>();

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
  });

  constructor() {
    if (this.data.role) {
      this.form.patchValue({
        name: this.data.role.name,
        description: this.data.role.description,
      });
      for (const p of this.data.role.permissions) {
        this.matrix.set(p.menuCode, new Set(p.actions));
      }
    }
  }

  has(menu: string, action: PermissionAction): boolean {
    return this.matrix.get(menu)?.has(action) ?? false;
  }

  toggle(menu: string, action: PermissionAction, checked: boolean): void {
    const set = this.matrix.get(menu) ?? new Set<PermissionAction>();
    if (checked) {
      set.add(action);
      if (action !== 'view') {
        set.add('view');
      }
    } else {
      set.delete(action);
      if (action === 'view') {
        set.clear();
      }
    }
    if (set.size === 0) {
      this.matrix.delete(menu);
    } else {
      this.matrix.set(menu, set);
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const permissions: Permission[] = Array.from(this.matrix.entries()).map(
      ([menuCode, actions]) => ({
        menuCode: menuCode as Permission['menuCode'],
        actions: Array.from(actions),
      })
    );
    const payload = {
      name: this.form.getRawValue().name,
      description: this.form.getRawValue().description,
      permissions,
    };

    this.saving.set(true);
    this.error.set(null);
    const req$ = this.data.role
      ? this.rolesApi.update(this.data.role.id, payload)
      : this.rolesApi.create(payload);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('บันทึกบทบาทแล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
