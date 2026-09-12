import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { MenuCode, PermissionAction } from '../../core/models/permission.model';
import { AuthService } from '../../core/services/auth.service';

/**
 * ตัวกั้นสิทธิ์ด้วย permissions จาก /api/auth/me เท่านั้น
 * ห้ามใช้ roles
 *
 * @example
 * ```html
 * <button *appHasPermission="'ticket.create'">เปิดใบ</button>
 * <button *appHasPermission="'projects'; appHasPermissionAction="'update'">แก้ไข</button>
 * ```
 *
 * ถ้าระบุเป็น `ticket.create` จะเช็ค permission code ตรง ๆ
 * ถ้าระบุเป็น menu code เช่น `projects` ใช้คู่กับ appHasPermissionAction (ค่าเริ่มต้น view)
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);

  /** permission code (`ticket.create`) หรือ menu code (`projects`) */
  readonly appHasPermission = input.required<string>();
  /** ใช้เมื่อ appHasPermission เป็น menu code */
  readonly appHasPermissionAction = input<string>('view');

  private shown = false;

  constructor() {
    effect(() => {
      this.auth.session();
      const code = this.appHasPermission();
      const action = this.appHasPermissionAction();
      const allowed = code.includes('.')
        ? this.auth.hasPermissionCode(code)
        : this.auth.hasPermission(code as MenuCode, action as PermissionAction);

      if (allowed && !this.shown) {
        this.vcr.createEmbeddedView(this.tpl);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.vcr.clear();
        this.shown = false;
      } else if (!allowed && !this.shown) {
        this.vcr.clear();
      }
    });
  }
}
